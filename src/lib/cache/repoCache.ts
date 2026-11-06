import { browser } from '$app/env';
import { get, set } from 'idb-keyval';
import type { BlobEntry, RepoRef } from '#lib/forge/types.ts';
import { snapshotKey } from './repoEntries';

export { relevantEntries, sameEntries, snapshotKey, splitEntries } from './repoEntries';

/**
 * The last known file listing of a repository, so it can be browsed offline and shown
 * instantly while a fresh listing loads. File contents live in the blob cache.
 */
export interface RepoSnapshot {
	resolvedRef: string;
	/** Markdown files under the base path, plus the template file when there is one. */
	entries: BlobEntry[];
	truncated: boolean;
	savedAt: number;
}

const PREFIX = 'repo:';

export async function readSnapshot(ref: RepoRef): Promise<RepoSnapshot | undefined> {
	if (!browser) return undefined;
	try {
		const value = await get<RepoSnapshot>(PREFIX + snapshotKey(ref));
		if (value && typeof value.resolvedRef === 'string' && Array.isArray(value.entries)) return value;
	} catch {
		// IndexedDB can be unavailable (private browsing, blocked storage).
	}
	return undefined;
}

export async function writeSnapshot(ref: RepoRef, snapshot: RepoSnapshot): Promise<void> {
	if (!browser) return;
	try {
		await set(PREFIX + snapshotKey(ref), snapshot);
	} catch {
		// Quota exceeded or storage blocked; the repository simply won't open offline.
	}
}
