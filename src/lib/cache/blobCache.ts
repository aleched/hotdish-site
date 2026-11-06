import { browser } from '$app/env';
import { clear, get, set } from 'idb-keyval';

/**
 * Blob shas are content-addressed: a file's sha changes if and only if its content changes.
 * That makes cache invalidation exact, so entries never need a TTL.
 */
const PREFIX = 'blob:';

/** Most recently used blobs kept in memory; IndexedDB holds the rest. */
const MEMORY_LIMIT = 300;
const memory = new Map<string, string>();
/** Bumped on clear so reads that started before it do not refill the memory cache. */
let generation = 0;

function remember(sha: string, content: string): void {
	memory.delete(sha);
	memory.set(sha, content);
	if (memory.size > MEMORY_LIMIT) memory.delete(memory.keys().next().value!);
}

export async function readBlob(sha: string): Promise<string | undefined> {
	const cached = memory.get(sha);
	if (cached !== undefined) {
		remember(sha, cached);
		return cached;
	}
	if (!browser) return undefined;

	const started = generation;
	try {
		const value = await get<string>(PREFIX + sha);
		if (typeof value === 'string') {
			if (started === generation) remember(sha, value);
			return value;
		}
	} catch {
		// IndexedDB can be unavailable (private browsing, blocked storage). Fall back silently.
	}
	return undefined;
}

export async function writeBlob(sha: string, content: string): Promise<void> {
	remember(sha, content);
	if (!browser) return;
	try {
		await set(PREFIX + sha, content);
	} catch {
		// Quota exceeded or storage blocked; the in-memory cache still serves this session.
	}
}

/** Empties both the in-memory and persistent caches. Safe: content is re-fetched on demand. */
export async function clearBlobCache(): Promise<void> {
	generation++;
	memory.clear();
	if (!browser) return;
	try {
		await clear();
	} catch {
		// Ignore.
	}
}
