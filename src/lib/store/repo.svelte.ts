import { readBlob, writeBlob } from '$lib/cache/blobCache';
import { readSnapshot, relevantEntries, sameEntries, splitEntries, writeSnapshot } from '$lib/cache/repoCache';
import { connectionStore } from '$lib/store/connection.svelte';
import { m } from '$lib/paraglide/messages.js';
import { createProvider } from '$lib/forge/factory';
import { ForgeError, describeForgeError } from '$lib/forge/errors';
import type { BlobEntry, ForgeProvider, RepoRef } from '$lib/forge/types';
import { parseDoc, toSummary } from '$lib/markdown/doc';
import type { Doc, DocSummary } from '$lib/markdown/doc';
import { parseTemplate, type DocTemplate } from '$lib/template/schema';
import { getDefaultTemplate } from '$lib/template/default';
import { editorPrefs } from '$lib/store/editorPrefs.svelte';
import { buildTree, type TreeFolder } from '$lib/tree';
import { mapWithConcurrency } from '$lib/util/concurrency';

export type RepoStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface LoadError {
	message: string;
	hint?: string;
}

const PREFETCH_CONCURRENCY = 6;

function storeKey(ref: RepoRef, token?: string): string {
	return [ref.kind, ref.host, ref.owner, ref.repo, ref.ref ?? '', ref.basePath ?? '', token ? '1' : '0'].join(
		'\u0000'
	);
}

class RepoStore {
	ref = $state<RepoRef | null>(null);
	resolvedRef = $state<string | null>(null);
	status = $state<RepoStatus>('idle');
	error = $state<LoadError | null>(null);

	entries = $state<BlobEntry[]>([]);
	docs = $state<DocSummary[]>([]);
	truncated = $state(false);

	indexing = $state(false);
	indexed = $state(0);
	indexTotal = $state(0);
	skipped = $state<string[]>([]);

	/** The repository's own template, if it has one. */
	#customTemplate = $state<DocTemplate | null>(null);
	/** True when the repository has no template file, so the built-in default applies. */
	#usesDefault = $state(false);
	templateError = $state<string | null>(null);

	query = $state('');
	selectedTags = $state<string[]>([]);
	selectedFolders = $state<string[]>([]);

	#provider = $state<ForgeProvider | null>(null);
	#key: string | null = null;
	#token: string | undefined;
	#docs = new Map<string, Doc>();
	#loadToken = 0;
	#templateEntry: BlobEntry | undefined;
	/** When the listing was last fetched from the forge. */
	#savedAt = 0;
	/** True once the listing came from the forge in this load, not only from the cache. */
	#fetched = false;
	#indexGen = 0;
	#visibility: Promise<boolean | null> | null = null;

	/** The repository's template, or the built-in default chosen in settings when it has none. */
	get template(): DocTemplate | null {
		if (!this.#usesDefault) return this.#customTemplate;
		const choice = editorPrefs.defaultTemplate;
		return choice === 'none' ? null : getDefaultTemplate(choice);
	}

	get templateIsDefault(): boolean {
		return this.#usesDefault && this.template !== null;
	}

	get provider(): ForgeProvider | null {
		return this.#provider;
	}

	get basePath(): string {
		return this.ref?.basePath ?? '';
	}

	allTags = $derived.by(() => {
		const counts = new Map<string, { label: string; count: number }>();
		for (const doc of this.docs) {
			for (const tag of doc.tags) {
				const key = tag.toLowerCase();
				const existing = counts.get(key);
				if (existing) existing.count++;
				else counts.set(key, { label: tag, count: 1 });
			}
		}
		return [...counts.entries()]
			.map(([key, value]) => ({ key, label: value.label, count: value.count }))
			.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
	});

	/** Directories (relative to basePath) 	containing documents, including ancestors, with recursive counts. */
	folders = $derived.by(() => {
		const base = this.basePath.replace(/\/+$/, '');
		const counts = new Map<string, number>();
			for (const doc of this.docs) {
				const rel = base && doc.path.startsWith(`${base}/`) ? doc.path.slice(base.length + 1) : doc.path;
			const parts = rel.split('/').slice(0, -1);
			for (let i = 1; i <= parts.length; i++) {
				const dir = parts.slice(0, i).join('/');
				counts.set(dir, (counts.get(dir) ?? 0) + 1);
			}
		}
		return [...counts.entries()]
			.map(([path, count]) => ({ path, count }))
			.sort((a, b) => a.path.localeCompare(b.path));
	});

	filtered = $derived.by(() => {
		const needle = this.query.trim().toLowerCase();
		const tags = this.selectedTags.map((tag) => tag.toLowerCase());
		const wanted = this.selectedFolders.map((folder) => folder.toLowerCase());
		const base = this.basePath.replace(/\/+$/, '');

		return this.docs.filter((doc) => {
			if (wanted.length > 0) {
				const rel =
					base && doc.path.startsWith(`${base}/`) ? doc.path.slice(base.length + 1) : doc.path;
				const folder = rel.split('/').slice(0, -1).join('/').toLowerCase();
				// A selected folder includes its subfolders.
				if (!wanted.some((name) => folder === name || folder.startsWith(`${name}/`))) return false;
			}
			if (needle && !doc.haystack.includes(needle)) return false;
			if (tags.length === 0) return true;
			const docTags = doc.tags.map((tag) => tag.toLowerCase());
			// All selected tags must be present, which makes stacking filters narrowing.
			return tags.every((tag) => docTags.includes(tag));
		});
	});

	tree = $derived.by<TreeFolder>(() => buildTree(this.filtered, this.basePath));

	get isFiltering(): boolean {
		return this.query.trim().length > 0 || this.selectedTags.length > 0 || this.selectedFolders.length > 0;
	}

	toggleTag(tag: string): void {
		const key = tag.toLowerCase();
		const index = this.selectedTags.findIndex((item) => item.toLowerCase() === key);
		if (index === -1) this.selectedTags = [...this.selectedTags, tag];
		else this.selectedTags = this.selectedTags.filter((_, i) => i !== index);
	}

	toggleFolder(path: string): void {
		this.selectedFolders = this.selectedFolders.includes(path)
			? this.selectedFolders.filter((item) => item !== path)
			: [...this.selectedFolders, path];
	}

	/** Clears the tag and folder filters; the search text is left alone. */
	clearFilters(): void {
		this.selectedTags = [];
		this.selectedFolders = [];
	}

	async load(ref: RepoRef, token?: string, options: { force?: boolean } = {}): Promise<void> {
		const key = storeKey(ref, token);
		if (!options.force && key === this.#key && this.status !== 'error') return;

		const loadToken = ++this.#loadToken;
		this.#key = key;
		this.#token = token;
		this.ref = ref;
		if (!options.force) {
			this.query = '';
			this.selectedTags = [];
			this.selectedFolders = [];
		}
		this.status = 'loading';
		this.error = null;
		this.entries = [];
		this.docs = [];
		this.skipped = [];
		this.truncated = false;
		this.indexed = 0;
		this.indexTotal = 0;
		this.#customTemplate = null;
		this.#usesDefault = false;
		this.templateError = null;
		this.#templateEntry = undefined;
		this.#savedAt = 0;
		this.#fetched = false;
		this.#docs.clear();
		this.#visibility = null;

		const provider = createProvider(ref, token);
		this.#provider = provider;

		// Show the last known listing straight away, then bring it up to date.
		const snapshot = await readSnapshot(ref);
		if (loadToken !== this.#loadToken) return;
		if (snapshot) {
			connectionStore.noteSnapshot(snapshot.savedAt);
			this.#savedAt = snapshot.savedAt;
			this.#apply(snapshot.resolvedRef, snapshot.entries, snapshot.truncated, loadToken, false);
		}

		await this.#revalidate(loadToken);
	}

	async reload(): Promise<void> {
		if (!this.ref) return;
		await this.load(this.ref, this.#token, { force: true });
	}

	/** Fetches the latest listing in the background, keeping what is on screen if that fails. */
	async refresh(): Promise<void> {
		if (!this.ref) return;
		if (this.status === 'loading') return;
		if (this.status !== 'ready') return this.reload();
		await this.#revalidate(this.#loadToken);
	}

	async #revalidate(loadToken: number): Promise<void> {
		const ref = this.ref;
		const provider = this.#provider;
		if (!ref || !provider) return;

		connectionStore.begin();
		try {
			const gitRef = ref.ref || (await provider.resolveDefaultBranch());
			if (loadToken !== this.#loadToken) return;
			const { entries, truncated } = await provider.listTree(gitRef);
			if (loadToken !== this.#loadToken) return;

			const relevant = relevantEntries(entries, ref.basePath);
			const current = this.#templateEntry ? [...this.entries, this.#templateEntry] : this.entries;
			const shown = this.status === 'ready';
			if (!shown || gitRef !== this.resolvedRef || !sameEntries(relevant, current)) {
				this.#apply(gitRef, relevant, truncated, loadToken, shown);
			}
			this.truncated = truncated;
			this.#savedAt = Date.now();
			this.#fetched = true;
			void this.#persist();
			connectionStore.markLive();
		} catch (error) {
			if (loadToken !== this.#loadToken) return;
			const described = describeForgeError(error);
			connectionStore.markOffline(described.message);
			// Any failure falls back to the cached listing when there is one.
			if (this.status !== 'ready') {
				this.status = 'error';
				this.error = described;
			}
		} finally {
			connectionStore.end();
		}
	}

	/**
	 * Shows a listing. When one is already on screen, the index is rebuilt quietly and swapped in
	 * at the end, so the page does not flicker through a partial list.
	 */
	#apply(gitRef: string, relevant: BlobEntry[], truncated: boolean, loadToken: number, quiet: boolean): void {
		const { markdown, template } = splitEntries(relevant);
		this.resolvedRef = gitRef;
		this.truncated = truncated;
		this.#templateEntry = template;
		this.entries = markdown;
		this.status = 'ready';
		this.error = null;

		void this.#loadTemplate(template, loadToken);
		void this.#buildIndex(markdown, loadToken, quiet);
	}

	/** Saves the listing as currently known, so local saves are reflected offline too. */
	async #persist(): Promise<void> {
		const ref = this.ref;
		const gitRef = this.resolvedRef;
		if (!ref || !gitRef || this.status !== 'ready') return;
		const entries = $state.snapshot(this.entries) as BlobEntry[];
		if (this.#templateEntry) entries.push({ ...this.#templateEntry });
		await writeSnapshot(ref, {
			resolvedRef: gitRef,
			entries,
			truncated: this.truncated,
			savedAt: this.#savedAt || Date.now()
		});
	}

	/**
	 * Whether the repository is readable without a token, or null if that could not be
	 * determined. Cached per load, since visibility rarely changes.
	 */
	isPublic(): Promise<boolean | null> {
		const provider = this.#provider;
		if (!provider) return Promise.resolve(null);
		// Loading without a token already proves the repository is public.
		if (!provider.authenticated && this.#fetched) return Promise.resolve(true);
		this.#visibility ??= provider.isPublic().catch(() => {
			this.#visibility = null;
			return null;
		});
		return this.#visibility;
	}

	entryFor(path: string): BlobEntry | undefined {
		return this.entries.find((entry) => entry.path === path);
	}

	/** Reads and parses a single document, preferring the content-addressed cache. */
	async getDoc(path: string): Promise<Doc> {
		const entry = this.entryFor(path);
		if (!entry) throw new Error(m.error_doc_not_found({ path }));

		const cached = this.#docs.get(entry.sha);
		if (cached) return cached;

		const raw = await this.#readEntry(entry);
		const doc = parseDoc(entry, raw);
		this.#docs.set(entry.sha, doc);
		return doc;
	}

	/** Replaces cached state after a successful save so the UI reflects the new content. */
	applySavedDoc(path: string, raw: string, newSha?: string): void {
		const entry = this.entryFor(path);
		if (!entry) return;
		if (newSha) entry.sha = newSha;

		const doc = parseDoc({ path, sha: entry.sha }, raw);
		this.#docs.set(entry.sha, doc);
		void writeBlob(entry.sha, raw);

		const summary = toSummary(doc);
		const index = this.docs.findIndex((item) => item.path === path);
		if (index === -1) this.docs = [...this.docs, summary];
		else this.docs[index] = summary;
		void this.#persist();
	}

	registerNewFile(path: string, raw: string, sha: string): void {
		const entry: BlobEntry = { path, sha };
		this.entries = [...this.entries, entry];
		const doc = parseDoc(entry, raw);
		this.#docs.set(sha, doc);
		this.docs = [...this.docs, toSummary(doc)];
		void this.#persist();
	}

	removeFile(path: string): void {
		this.entries = this.entries.filter((entry) => entry.path !== path);
		this.docs = this.docs.filter((doc) => doc.path !== path);
		void this.#persist();
	}

	/** Moves are content-preserving, so the blob sha (and cached raw text) carry over. */
	renameFile(from: string, to: string): void {
		const entry = this.entryFor(from);
		if (!entry) return;
		const sha = entry.sha;
		this.entries = [...this.entries.filter((item) => item.path !== from), { ...entry, path: to }];

		const cached = this.#docs.get(sha);
		if (cached) {
			const doc = parseDoc({ path: to, sha }, cached.raw);
			this.#docs.set(sha, doc);
			this.docs = [...this.docs.filter((item) => item.path !== from), toSummary(doc)];
		} else {
			this.docs = this.docs.map((item) =>
				item.path === from ? { ...item, path: to } : item
			);
		}
		void this.#persist();
	}

	/**
	 * Swaps in an authenticated provider without reloading, so adding a token mid-session
	 * keeps the index and open document intact.
	 */
	setToken(token: string): void {
		if (!this.ref) return;
		this.#token = token;
		this.#key = storeKey(this.ref, token);
		this.#provider = createProvider(this.ref, token);
	}

	async #readEntry(entry: BlobEntry): Promise<string> {
		const cached = await readBlob(entry.sha);
		if (cached !== undefined) return cached;

		const provider = this.#provider;
		if (!provider || !this.resolvedRef) throw new Error(m.error_repo_not_loaded());

		let raw: string;
		try {
			raw = await provider.readFile(entry.path, this.resolvedRef);
		} catch (error) {
			if (error instanceof ForgeError && error.kind === 'network') connectionStore.markOffline(error.message);
			if (!connectionStore.online) throw new Error(m.offline_doc_missing());
			throw error;
		}
		await writeBlob(entry.sha, raw);
		return raw;
	}

	async #buildIndex(entries: BlobEntry[], loadToken: number, quiet = false): Promise<void> {
		// Only the newest build publishes, so a slower stale one can't overwrite fresher results.
		const gen = ++this.#indexGen;
		const current = () => loadToken === this.#loadToken && gen === this.#indexGen;
		if (!quiet) {
			this.indexing = true;
			this.indexTotal = entries.length;
			this.indexed = 0;
		}

		const summaries: DocSummary[] = [];
		const skipped: string[] = [];

		await mapWithConcurrency(entries, PREFETCH_CONCURRENCY, async (entry) => {
			if (!current()) return;
			try {
				const raw = await this.#readEntry(entry);
				const doc = parseDoc(entry, raw);
				this.#docs.set(entry.sha, doc);
				summaries.push(toSummary(doc));
			} catch {
				// One unreadable file must not abort the whole index.
				skipped.push(entry.path);
			} finally {
				if (current() && !quiet) {
					this.indexed++;
					// Publish incrementally so results appear while indexing continues.
					if (this.indexed % 10 === 0) this.docs = [...summaries];
				}
			}
		});

		if (!current()) return;
		this.docs = summaries;
		this.skipped = skipped;
		this.indexing = false;
	}

	async #loadTemplate(entry: BlobEntry | undefined, loadToken: number): Promise<void> {
		if (!entry) {
			this.#customTemplate = null;
			this.templateError = null;
			this.#usesDefault = true;
			return;
		}

		try {
			const raw = await this.#readEntry(entry);
			if (loadToken !== this.#loadToken) return;
			this.#usesDefault = false;
			// An empty template file is a deliberate opt-out: plain markdown, no warning.
			if (!raw.trim()) {
				this.#customTemplate = null;
				this.templateError = null;
				return;
			}
			const result = parseTemplate(raw);
			this.#customTemplate = result.template;
			this.templateError = result.error ?? null;
		} catch (error) {
			if (loadToken !== this.#loadToken) return;
			// A template problem must never block browsing; documents still render generically.
			this.templateError = error instanceof Error ? error.message : String(error);
		}
	}
}

export const repoStore = new RepoStore();
