import { readBlob, writeBlob } from '$lib/cache/blobCache';
import { createProvider } from '$lib/forge/factory';
import { describeForgeError } from '$lib/forge/errors';
import type { BlobEntry, ForgeProvider, RateLimitInfo, RepoRef } from '$lib/forge/types';
import { isMarkdownPath, parseRecipe, toSummary } from '$lib/markdown/recipe';
import type { RecipeDoc, RecipeSummary } from '$lib/markdown/recipe';
import { TEMPLATE_PATH, parseTemplate, type RecipeTemplate } from '$lib/template/schema';
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
	recipes = $state<RecipeSummary[]>([]);
	truncated = $state(false);

	indexing = $state(false);
	indexed = $state(0);
	indexTotal = $state(0);
	skipped = $state<string[]>([]);

	rateLimit = $state<RateLimitInfo | null>(null);
	template = $state<RecipeTemplate | null>(null);
	templateError = $state<string | null>(null);

	query = $state('');
	selectedTags = $state<string[]>([]);

	#provider: ForgeProvider | null = null;
	#key: string | null = null;
	#token: string | undefined;
	#docs = new Map<string, RecipeDoc>();
	#loadToken = 0;

	get provider(): ForgeProvider | null {
		return this.#provider;
	}

	get basePath(): string {
		return this.ref?.basePath ?? '';
	}

	allTags = $derived.by(() => {
		const counts = new Map<string, { label: string; count: number }>();
		for (const recipe of this.recipes) {
			for (const tag of recipe.tags) {
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

	filtered = $derived.by(() => {
		const needle = this.query.trim().toLowerCase();
		const tags = this.selectedTags.map((tag) => tag.toLowerCase());

		return this.recipes.filter((recipe) => {
			if (needle && !recipe.haystack.includes(needle)) return false;
			if (tags.length === 0) return true;
			const recipeTags = recipe.tags.map((tag) => tag.toLowerCase());
			// All selected tags must be present, which makes stacking filters narrowing.
			return tags.every((tag) => recipeTags.includes(tag));
		});
	});

	tree = $derived.by<TreeFolder>(() => buildTree(this.filtered, this.basePath));

	get isFiltering(): boolean {
		return this.query.trim().length > 0 || this.selectedTags.length > 0;
	}

	toggleTag(tag: string): void {
		const key = tag.toLowerCase();
		const index = this.selectedTags.findIndex((item) => item.toLowerCase() === key);
		if (index === -1) this.selectedTags = [...this.selectedTags, tag];
		else this.selectedTags = this.selectedTags.filter((_, i) => i !== index);
	}

	clearFilters(): void {
		this.query = '';
		this.selectedTags = [];
	}

	async load(ref: RepoRef, token?: string, options: { force?: boolean } = {}): Promise<void> {
		const key = storeKey(ref, token);
		if (!options.force && key === this.#key && this.status !== 'error') return;

		const loadToken = ++this.#loadToken;
		this.#key = key;
		this.#token = token;
		this.ref = ref;
		this.status = 'loading';
		this.error = null;
		this.entries = [];
		this.recipes = [];
		this.skipped = [];
		this.truncated = false;
		this.indexed = 0;
		this.indexTotal = 0;
		this.template = null;
		this.templateError = null;
		this.#docs.clear();

		const provider = createProvider(ref, token);
		this.#provider = provider;

		try {
			const gitRef = ref.ref || (await provider.resolveDefaultBranch());
			if (loadToken !== this.#loadToken) return;
			this.resolvedRef = gitRef;

			const { entries, truncated } = await provider.listTree(gitRef);
			if (loadToken !== this.#loadToken) return;

			this.truncated = truncated;
			this.rateLimit = provider.rateLimit();

			const prefix = ref.basePath ? `${ref.basePath.replace(/\/+$/, '')}/` : '';
			const markdown = entries.filter(
				(entry) =>
					isMarkdownPath(entry.path) &&
					!entry.path.startsWith('.') &&
					!entry.path.includes('/.') &&
					(!prefix || entry.path.startsWith(prefix))
			);

			this.entries = markdown;
			this.status = 'ready';

			void this.#loadTemplate(entries, gitRef, loadToken);
			void this.#buildIndex(markdown, gitRef, loadToken);
		} catch (error) {
			if (loadToken !== this.#loadToken) return;
			this.status = 'error';
			this.error = describeForgeError(error);
			this.rateLimit = provider.rateLimit();
		}
	}

	async reload(): Promise<void> {
		if (!this.ref) return;
		await this.load(this.ref, this.#token, { force: true });
	}

	entryFor(path: string): BlobEntry | undefined {
		return this.entries.find((entry) => entry.path === path);
	}

	/** Reads and parses a single recipe, preferring the content-addressed cache. */
	async getDoc(path: string): Promise<RecipeDoc> {
		const entry = this.entryFor(path);
		if (!entry) throw new Error(`No recipe found at ${path}`);

		const cached = this.#docs.get(entry.sha);
		if (cached) return cached;

		const raw = await this.#readEntry(entry);
		const doc = parseRecipe(entry, raw);
		this.#docs.set(entry.sha, doc);
		return doc;
	}

	/** Replaces cached state after a successful save so the UI reflects the new content. */
	applySavedDoc(path: string, raw: string, newSha?: string): void {
		const entry = this.entryFor(path);
		if (!entry) return;
		if (newSha) entry.sha = newSha;

		const doc = parseRecipe({ path, sha: entry.sha }, raw);
		this.#docs.set(entry.sha, doc);
		void writeBlob(entry.sha, raw);

		const summary = toSummary(doc);
		const index = this.recipes.findIndex((recipe) => recipe.path === path);
		if (index === -1) this.recipes = [...this.recipes, summary];
		else this.recipes[index] = summary;
	}

	registerNewFile(path: string, raw: string, sha: string): void {
		const entry: BlobEntry = { path, sha };
		this.entries = [...this.entries, entry];
		const doc = parseRecipe(entry, raw);
		this.#docs.set(sha, doc);
		this.recipes = [...this.recipes, toSummary(doc)];
	}

	async #readEntry(entry: BlobEntry): Promise<string> {
		const cached = await readBlob(entry.sha);
		if (cached !== undefined) return cached;

		const provider = this.#provider;
		if (!provider || !this.resolvedRef) throw new Error('Repository is not loaded.');

		const raw = await provider.readFile(entry.path, this.resolvedRef);
		await writeBlob(entry.sha, raw);
		return raw;
	}

	async #buildIndex(entries: BlobEntry[], _gitRef: string, loadToken: number): Promise<void> {
		this.indexing = true;
		this.indexTotal = entries.length;
		this.indexed = 0;

		const summaries: RecipeSummary[] = [];
		const skipped: string[] = [];

		await mapWithConcurrency(entries, PREFETCH_CONCURRENCY, async (entry) => {
			if (loadToken !== this.#loadToken) return;
			try {
				const raw = await this.#readEntry(entry);
				const doc = parseRecipe(entry, raw);
				this.#docs.set(entry.sha, doc);
				summaries.push(toSummary(doc));
			} catch {
				// One unreadable file must not abort the whole index.
				skipped.push(entry.path);
			} finally {
				if (loadToken === this.#loadToken) {
					this.indexed++;
					// Publish incrementally so results appear while indexing continues.
					if (this.indexed % 10 === 0) this.recipes = [...summaries];
				}
			}
		});

		if (loadToken !== this.#loadToken) return;
		this.recipes = summaries;
		this.skipped = skipped;
		this.indexing = false;
		this.rateLimit = this.#provider?.rateLimit() ?? this.rateLimit;
	}

	async #loadTemplate(allEntries: BlobEntry[], gitRef: string, loadToken: number): Promise<void> {
		const entry = allEntries.find((item) => item.path === TEMPLATE_PATH);
		if (!entry) return;

		try {
			const raw = await this.#readEntry(entry);
			if (loadToken !== this.#loadToken) return;
			const result = parseTemplate(raw);
			this.template = result.template;
			this.templateError = result.error ?? null;
		} catch (error) {
			if (loadToken !== this.#loadToken) return;
			// A template problem must never block browsing; recipes still render generically.
			this.templateError = error instanceof Error ? error.message : String(error);
		}
		void gitRef;
	}
}

export const repoStore = new RepoStore();
