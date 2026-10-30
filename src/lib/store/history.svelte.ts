import { browser } from '$app/environment';
import { get, set } from 'idb-keyval';
import type { RepoRef } from '$lib/forge/types';

export interface HistoryItem {
	/** Path relative to the repository's base path, as used in recipe URLs. */
	path: string;
	title: string;
	openedAt: number;
}

const MAX_ITEMS = 30;

function historyKey(ref: RepoRef): string {
	return ['history', ref.kind, ref.host, ref.owner, ref.repo].join(':');
}

/** Most-recently-opened recipes for the current repository, persisted in IndexedDB with the cache. */
class HistoryStore {
	items = $state<HistoryItem[]>([]);
	#key: string | null = null;

	async load(ref: RepoRef): Promise<void> {
		const key = historyKey(ref);
		if (key === this.#key) return;
		this.#key = key;
		this.items = [];
		if (!browser) return;
		try {
			const stored = await get<HistoryItem[]>(key);
			if (this.#key === key && Array.isArray(stored)) this.items = stored;
		} catch {
			// Storage unavailable; history just stays empty.
		}
	}

	async record(ref: RepoRef, path: string, title: string): Promise<void> {
		await this.load(ref);
		const key = this.#key;
		if (!key) return;
		const next = [
			{ path, title, openedAt: Date.now() },
			...this.items.filter((item) => item.path !== path)
		].slice(0, MAX_ITEMS);
		this.items = next;
		if (!browser) return;
		try {
			await set(key, $state.snapshot(next));
		} catch {
			// Quota or blocked storage; the in-memory list still works this session.
		}
	}

	/** Called after the cache is cleared so the UI does not keep showing stale history. */
	reset(): void {
		this.items = [];
		this.#key = null;
	}

	async forget(ref: RepoRef, path: string): Promise<void> {
		await this.load(ref);
		await this.#save(this.items.filter((item) => item.path !== path));
	}

	async rename(ref: RepoRef, from: string, to: string): Promise<void> {
		await this.load(ref);
		await this.#save(this.items.map((item) => (item.path === from ? { ...item, path: to } : item)));
	}

	async #save(next: HistoryItem[]): Promise<void> {
		const key = this.#key;
		if (!key) return;
		this.items = next;
		if (!browser) return;
		try {
			await set(key, $state.snapshot(next));
		} catch {
			// Quota or blocked storage; the in-memory list still works this session.
		}
	}
}

export const historyStore = new HistoryStore();
