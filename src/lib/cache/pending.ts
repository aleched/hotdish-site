import { browser } from '$app/env';
import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import type { PendingChange } from '#lib/changes.ts';

/**
 * Changes saved but not yet committed. Stored apart from the content cache, so clearing the
 * cache cannot discard them, and keyed per repository and branch.
 */
let store: UseStore | null = null;

function pendingStore(): UseStore {
	store ??= createStore('hotdish-pending', 'pending');
	return store;
}

export async function readPending(key: string): Promise<PendingChange[]> {
	if (!browser) return [];
	try {
		const value = await get<PendingChange[]>(key, pendingStore());
		if (Array.isArray(value)) return value;
	} catch {
		// Storage unavailable: nothing pending can be restored.
	}
	return [];
}

export async function writePending(key: string, list: PendingChange[]): Promise<void> {
	if (!browser) return;
	try {
		if (list.length === 0) await del(key, pendingStore());
		else await set(key, JSON.parse(JSON.stringify(list)) as PendingChange[], pendingStore());
	} catch {
		// Ignore; the changes stay in memory for this session.
	}
}
