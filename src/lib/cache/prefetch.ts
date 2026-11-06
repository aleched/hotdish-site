import { readBlob, writeBlob } from '#lib/cache/blobCache.ts';
import { readSnapshot, relevantEntries, snapshotKey, writeSnapshot } from '#lib/cache/repoCache.ts';
import { ForgeError } from '#lib/forge/errors.ts';
import { createProvider } from '#lib/forge/factory.ts';
import type { RepoRef } from '#lib/forge/types.ts';
import { connectionStore } from '#lib/store/connection.svelte.ts';
import { profileStore, profileToRef } from '#lib/store/profiles.svelte.ts';
import { repoStore } from '#lib/store/repo.svelte.ts';
import { mapWithConcurrency } from '#lib/util/concurrency.ts';

/** A saved repository is re-fetched in the background at most this often. */
const STALE_MS = 60 * 60 * 1000;
const BLOB_CONCURRENCY = 4;

let running: Promise<void> | null = null;

/** An exhausted quota will fail every other repository on the same forge too. */
function isRateLimit(error: unknown): boolean {
	return error instanceof ForgeError && error.kind === 'rate-limit';
}

function isNetwork(error: unknown): boolean {
	return error instanceof ForgeError && error.kind === 'network';
}

async function prefetchRepo(ref: RepoRef, token: string | undefined): Promise<void> {
	const provider = createProvider(ref, token);
	const gitRef = ref.ref || (await provider.resolveDefaultBranch());
	const { entries, truncated } = await provider.listTree(gitRef);
	const relevant = relevantEntries(entries, ref.basePath);
	await writeSnapshot(ref, { resolvedRef: gitRef, entries: relevant, truncated, savedAt: Date.now() });

	let stop: unknown = null;
	await mapWithConcurrency(relevant, BLOB_CONCURRENCY, async (entry) => {
		if (stop) return;
		if ((await readBlob(entry.sha)) !== undefined) return;
		try {
			await writeBlob(entry.sha, await provider.readFile(entry.path, gitRef));
		} catch (error) {
			if (isRateLimit(error) || isNetwork(error)) stop = error;
		}
	});
	if (stop) throw stop;
}

/**
 * Downloads the listing and markdown of every saved repository, so each one opens offline.
 * Runs one repository at a time. Stops on a rate limit, or when two repositories in a row are
 * unreachable (one unreachable host alone may just be a self-hosted forge without CORS).
 */
export function prefetchSaved(options: { force?: boolean } = {}): Promise<void> {
	running ??= (async () => {
		try {
			const open = repoStore.ref ? snapshotKey(repoStore.ref) : null;
			let unreachable = 0;
			let lastNetworkError: unknown = null;
			for (const profile of [...profileStore.profiles]) {
				const ref = profileToRef(profile);
				// The open repository is kept current by the repo store itself.
				if (snapshotKey(ref) === open) continue;
				if (!options.force) {
					const snapshot = await readSnapshot(ref);
					if (snapshot && Date.now() - snapshot.savedAt < STALE_MS) continue;
				}
				try {
					await prefetchRepo(ref, profile.token);
					unreachable = 0;
				} catch (error) {
					if (isRateLimit(error)) throw error;
					if (isNetwork(error)) {
						lastNetworkError = error;
						if (++unreachable >= 2) throw error;
					}
					// A repository that is gone or needs a new token must not stop the others.
				}
			}
			if (unreachable > 0 && unreachable === profileStore.profiles.length) throw lastNetworkError;
		} finally {
			running = null;
		}
	})();
	return running;
}

/** Refreshes the open repository, then the saved ones. Used by the header icon and on reconnect. */
export async function syncNow(options: { force?: boolean } = {}): Promise<void> {
	if (repoStore.ref) {
		await repoStore.refresh();
		void prefetchSaved(options).catch(() => {});
		return;
	}

	connectionStore.begin();
	try {
		await prefetchSaved(options);
		if (connectionStore.browserOnline) connectionStore.markLive();
		else connectionStore.markOffline();
	} catch (error) {
		connectionStore.markOffline(error instanceof Error ? error.message : String(error));
	} finally {
		connectionStore.end();
	}
}
