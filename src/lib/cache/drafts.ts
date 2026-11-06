import { browser } from '$app/environment';
import { createStore, del, get, set, type UseStore } from 'idb-keyval';

/**
 * Unsaved editor work, kept so a lost connection, reload or closed app never loses typing.
 * Stored apart from the content cache, so clearing the cache cannot discard drafts.
 */
export interface Draft {
	raw: string;
	mode: string;
	/** Path relative to the base path the document should be saved to. */
	targetRelative?: string;
	/** Blob sha of the file when editing began; differs from the file's sha if it changed since. */
	baseSha: string;
	savedAt: number;
}

let store: UseStore | null = null;

function draftStore(): UseStore {
	store ??= createStore('hotdish-drafts', 'drafts');
	return store;
}

/** Key for a draft of an existing file, or the one pending new document per repository. */
export function draftKey(repoKey: string, path: string | null): string {
	return `${repoKey}\u0001${path ?? '\u0002new'}`;
}

export async function readDraft(key: string): Promise<Draft | undefined> {
	if (!browser) return undefined;
	try {
		const value = await get<Draft>(key, draftStore());
		if (value && typeof value.raw === 'string') return value;
	} catch {
		// Storage unavailable: drafts are a convenience, editing still works.
	}
	return undefined;
}

export async function writeDraft(key: string, draft: Draft): Promise<void> {
	if (!browser) return;
	try {
		await set(key, draft, draftStore());
	} catch {
		// Ignore; the editor still holds the content in memory.
	}
}

export async function deleteDraft(key: string): Promise<void> {
	if (!browser) return;
	try {
		await del(key, draftStore());
	} catch {
		// Ignore.
	}
}
