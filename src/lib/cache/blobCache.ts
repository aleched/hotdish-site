import { browser } from '$app/environment';
import { clear, get, set } from 'idb-keyval';

/**
 * Blob shas are content-addressed: a file's sha changes if and only if its content changes.
 * That makes cache invalidation exact, so entries never need a TTL.
 */
const PREFIX = 'blob:';

const memory = new Map<string, string>();

export async function readBlob(sha: string): Promise<string | undefined> {
	const cached = memory.get(sha);
	if (cached !== undefined) return cached;
	if (!browser) return undefined;

	try {
		const value = await get<string>(PREFIX + sha);
		if (typeof value === 'string') {
			memory.set(sha, value);
			return value;
		}
	} catch {
		// IndexedDB can be unavailable (private browsing, blocked storage). Fall back silently.
	}
	return undefined;
}

export async function writeBlob(sha: string, content: string): Promise<void> {
	memory.set(sha, content);
	if (!browser) return;
	try {
		await set(PREFIX + sha, content);
	} catch {
		// Quota exceeded or storage blocked; the in-memory cache still serves this session.
	}
}

/** Empties both the in-memory and persistent caches. Safe: content is re-fetched on demand. */
export async function clearBlobCache(): Promise<void> {
	memory.clear();
	if (!browser) return;
	try {
		await clear();
	} catch {
		// Ignore.
	}
}
