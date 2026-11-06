import { browser } from '$app/env';
import { get, set, del } from 'idb-keyval';
import type { RepoRef } from '#lib/forge/types.ts';

function strikeStoreKey(ref: RepoRef, path: string): string {
	return ['strikes', ref.kind, ref.host, ref.owner, ref.repo, path].join(':');
}

/** Struck-through list items for the open document. Local only: kept in IndexedDB, never committed. */
class StrikeStore {
	keys = $state<string[]>([]);
	#key: string | null = null;

	async load(ref: RepoRef, path: string): Promise<void> {
		const key = strikeStoreKey(ref, path);
		if (key === this.#key) return;
		this.#key = key;
		this.keys = [];
		if (!browser) return;
		try {
			const stored = await get<string[]>(key);
			if (this.#key === key && Array.isArray(stored)) this.keys = stored;
		} catch {
			// Storage unavailable; marks just last for this session.
		}
	}

	has(itemKey: string): boolean {
		return this.keys.includes(itemKey);
	}

	async toggle(itemKey: string): Promise<void> {
		const next = this.has(itemKey)
			? this.keys.filter((key) => key !== itemKey)
			: [...this.keys, itemKey];
		await this.#save(next);
	}

	async clear(): Promise<void> {
		const key = this.#key;
		this.keys = [];
		if (!key || !browser) return;
		try {
			await del(key);
		} catch {
			// Ignore.
		}
	}

	/** Called after the cache is cleared so the UI does not keep showing stale marks. */
	reset(): void {
		this.keys = [];
		this.#key = null;
	}

	async #save(next: string[]): Promise<void> {
		const key = this.#key;
		this.keys = next;
		if (!key || !browser) return;
		try {
			await set(key, $state.snapshot(next));
		} catch {
			// Quota or blocked storage; the in-memory marks still work this session.
		}
	}
}

export const strikeStore = new StrikeStore();
