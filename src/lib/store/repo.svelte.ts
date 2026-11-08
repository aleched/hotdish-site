import { readBlob, writeBlob } from '#lib/cache/blobCache.ts';
import { readPending, writePending } from '#lib/cache/pending.ts';
import { readSnapshot, relevantEntries, sameEntries, snapshotKey, splitEntries, writeSnapshot } from '#lib/cache/repoCache.ts';
import {
	discardChange,
	isLocalSha,
	localContents,
	overlayEntries,
	stageAdd,
	stageDelete,
	stageEdit,
	stageMove,
	withoutChanges,
	type PendingChange
} from '#lib/changes.ts';
import { connectionStore } from '#lib/store/connection.svelte.ts';
import { m } from '#lib/paraglide/messages.js';
import { createProvider } from '#lib/forge/factory.ts';
import { ForgeError, describeForgeError } from '#lib/forge/errors.ts';
import type { BlobEntry, ForgeProvider, RepoRef } from '#lib/forge/types.ts';
import { parseDoc, toSummary } from '#lib/markdown/doc.ts';
import { matchesText, type SearchOptions } from '#lib/search.ts';
import type { Doc, DocSummary } from '#lib/markdown/doc.ts';
import { parseTemplate, type DocTemplate } from '#lib/template/schema.ts';
import { getDefaultTemplate } from '#lib/template/default.ts';
import { editorPrefs } from '#lib/store/editorPrefs.svelte.ts';
import { buildTree, type TreeFolder } from '#lib/tree.ts';
import { mapWithConcurrency } from '#lib/util/concurrency.ts';

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

	/** Changes saved on this device and not yet committed, for the current repository and branch. */
	pending = $state<PendingChange[]>([]);
	/** The repository's own template, if it has one. */
	#customTemplate = $state<DocTemplate | null>(null);
	/** True when the repository has no template file, so the built-in default applies. */
	#usesDefault = $state(false);
	templateError = $state<string | null>(null);

	query = $state('');
	/** When on, the search text is also matched against document bodies. */
	fullText = $state(false);
	/** Full-text options; they only affect matching inside document bodies. */
	matchCase = $state(false);
	wholeWord = $state(false);
	selectedTags = $state<string[]>([]);
	selectedFolders = $state<string[]>([]);

	#provider = $state<ForgeProvider | null>(null);
	#key: string | null = null;
	#token: string | undefined;
	#docs = new Map<string, Doc>();
	/** The listing as the repository has it, without pending changes. */
	#baseEntries: BlobEntry[] = [];
	/** Content of locally changed files by local sha. */
	#localRaw = new Map<string, string>();
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
		const fullText = this.fullText;
		const options = this.searchOptions;
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
			if (needle && !doc.haystack.includes(needle) && !(fullText && matchesText(doc.text, this.query, options))) {
				return false;
			}
			if (tags.length === 0) return true;
			const docTags = doc.tags.map((tag) => tag.toLowerCase());
			// All selected tags must be present, which makes stacking filters narrowing.
			return tags.every((tag) => docTags.includes(tag));
		});
	});

	get searchOptions(): SearchOptions {
		return { matchCase: this.matchCase, wholeWord: this.wholeWord };
	}

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
			this.fullText = false;
			this.matchCase = false;
			this.wholeWord = false;
			this.selectedTags = [];
			this.selectedFolders = [];
		}
		this.status = 'loading';
		this.error = null;
		this.entries = [];
		this.docs = [];
		this.pending = [];
		this.#baseEntries = [];
		this.#localRaw.clear();
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
		const [snapshot, pending] = await Promise.all([readSnapshot(ref), readPending(snapshotKey(ref))]);
		if (loadToken !== this.#loadToken) return;
		this.pending = pending;
		this.#localRaw = localContents(pending);
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
			const current = this.#templateEntry ? [...this.#baseEntries, this.#templateEntry] : this.#baseEntries;
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
		this.#baseEntries = markdown;
		const shown = overlayEntries(markdown, this.pending);
		this.entries = shown;
		this.status = 'ready';
		this.error = null;

		void this.#loadTemplate(template, loadToken);
		void this.#buildIndex(shown, loadToken, quiet);
	}

	/** Saves the listing as currently known, so local saves are reflected offline too. */
	async #persist(): Promise<void> {
		const ref = this.ref;
		const gitRef = this.resolvedRef;
		if (!ref || !gitRef || this.status !== 'ready') return;
		const entries = $state.snapshot(this.#baseEntries) as BlobEntry[];
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

	get pendingCount(): number {
		return this.pending.length;
	}

	/** The pending change for a file at its current path, if any. */
	pendingFor(path: string): PendingChange | undefined {
		return this.pending.find((change) => change.path === path);
	}

	/** The file as the repository has it, which is what a change is measured against. */
	async #baseOf(path: string): Promise<{ sha: string; raw: string }> {
		const entry = this.entryFor(path);
		if (!entry) throw new Error(m.error_doc_not_found({ path }));
		const doc = await this.getDoc(path);
		return { sha: entry.sha, raw: doc.raw };
	}

	/** Saves new content for an existing file. The change stays on this device until committed. */
	async stageEdit(path: string, raw: string): Promise<void> {
		const base = this.pendingFor(path) ? { sha: '', raw: '' } : await this.#baseOf(path);
		await this.#setPending(stageEdit(this.pending, path, raw, base));
	}

	async stageAdd(path: string, raw: string): Promise<void> {
		await this.#setPending(stageAdd(this.pending, path, raw));
	}

	async stageDelete(path: string): Promise<void> {
		const base = this.pendingFor(path) ? { sha: '', raw: '' } : await this.#baseOf(path);
		await this.#setPending(stageDelete(this.pending, path, base));
	}

	/** Moves a file, carrying `raw`, the content it should have at `to`. */
	async stageMove(from: string, to: string, raw: string): Promise<void> {
		const base = this.pendingFor(from) ? { sha: '', raw: '' } : await this.#baseOf(from);
		await this.#setPending(stageMove(this.pending, from, to, raw, base));
	}

	async discardChange(path: string): Promise<void> {
		await this.#setPending(discardChange(this.pending, path));
	}

	async discardAll(): Promise<void> {
		await this.#setPending([]);
	}

	/** Called once `committed` is in a commit; any other changes stay pending. The listing is reloaded to pick up the new commit. */
	async commitDone(committed: PendingChange[]): Promise<void> {
		await this.#setPending(withoutChanges(this.pending, committed));
		await this.reload();
	}

	/** Applies a new set of pending changes to the listing and the search index. */
	async #setPending(next: PendingChange[]): Promise<void> {
		const previous = this.pending;
		this.pending = next;
		this.#localRaw = localContents(next);
		this.entries = overlayEntries(this.#baseEntries, next);
		if (this.ref) await writePending(snapshotKey(this.ref), next);

		const touched = new Set<string>();
		for (const change of [...previous, ...next]) {
			touched.add(change.path);
			if (change.from) touched.add(change.from);
		}
		const docs = this.docs.filter((doc) => !touched.has(doc.path));
		for (const path of touched) {
			if (!this.entryFor(path)) continue;
			try {
				docs.push(toSummary(await this.getDoc(path)));
			} catch {
				// The index skips a file it cannot read, and so does this.
			}
		}
		this.docs = docs;
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
		if (isLocalSha(entry.sha)) {
			const local = this.#localRaw.get(entry.sha);
			if (local === undefined) throw new Error(m.error_doc_not_found({ path: entry.path }));
			return local;
		}
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
