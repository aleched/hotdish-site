import { ForgeError } from './errors';
import { forgeFetch, forgeFetchJson, readRateLimit } from './http';
import type {
	BlobEntry,
	DeleteArgs,
	ForgeProvider,
	MoveArgs,
	RateLimitInfo,
	RepoRef,
	TreeResult,
	WriteArgs,
	WriteResult
} from './types';

interface GlProject {
	default_branch: string;
}

interface GlTreeEntry {
	id: string;
	name: string;
	type: 'blob' | 'tree';
	path: string;
}

interface GlFileMeta {
	blob_id: string;
	last_commit_id: string;
}

const TREE_PAGE_SIZE = 100;
const MAX_TREE_PAGES = 100;

/**
 * GitLab differs from GitHub in three ways that matter here: the project is addressed by a
 * URL-encoded `owner/repo` slug, tree listings are paginated (100 per page), and writes are
 * guarded by `last_commit_id` rather than a blob sha.
 */
export class GitLabProvider implements ForgeProvider {
	readonly kind = 'gitlab' as const;
	readonly ref: RepoRef;

	#token?: string;
	#rateLimit: RateLimitInfo | null = null;

	constructor(ref: RepoRef, token?: string) {
		this.ref = ref;
		this.#token = token || undefined;
	}

	get authenticated(): boolean {
		return Boolean(this.#token);
	}

	get #apiBase(): string {
		return `https://${this.ref.host}/api/v4`;
	}

	get #projectId(): string {
		return encodeURIComponent(`${this.ref.owner}/${this.ref.repo}`);
	}

	get #ctx() {
		return {
			kind: this.kind,
			host: this.ref.host,
			onResponse: (response: Response) => {
				const info = readRateLimit(response.headers);
				if (info) this.#rateLimit = info;
			}
		};
	}

	#headers(extra: Record<string, string> = {}): Record<string, string> {
		const headers: Record<string, string> = { Accept: 'application/json', ...extra };
		if (this.#token) headers['PRIVATE-TOKEN'] = this.#token;
		return headers;
	}

	rateLimit(): RateLimitInfo | null {
		return this.#rateLimit;
	}

	webUrl(path: string, ref: string, isDir = false): string {
		return `https://${this.ref.host}/${this.ref.owner}/${this.ref.repo}/-/${isDir ? 'tree' : 'blob'}/${encodeURIComponent(ref)}/${path
			.split('/')
			.map(encodeURIComponent)
			.join('/')}`;
	}

	async resolveDefaultBranch(): Promise<string> {
		const project = await forgeFetchJson<GlProject>(
			`${this.#apiBase}/projects/${this.#projectId}`,
			{ headers: this.#headers() },
			this.#ctx
		);
		return project.default_branch;
	}

	async listTree(ref: string): Promise<TreeResult> {
		const entries: BlobEntry[] = [];
		let truncated = false;
		let page = 1;

		for (;;) {
			const url =
				`${this.#apiBase}/projects/${this.#projectId}/repository/tree` +
				`?recursive=true&per_page=${TREE_PAGE_SIZE}&page=${page}&ref=${encodeURIComponent(ref)}`;
			const response = await forgeFetch(url, { headers: this.#headers() }, this.#ctx);
			const batch = (await response.json()) as GlTreeEntry[];

			for (const entry of batch) {
				if (entry.type === 'blob') entries.push({ path: entry.path, sha: entry.id });
			}

			const nextPage = response.headers.get('x-next-page');
			if (!nextPage || nextPage.trim() === '') break;

			page = Number.parseInt(nextPage, 10);
			if (!Number.isFinite(page)) break;
			if (page > MAX_TREE_PAGES) {
				truncated = true;
				break;
			}
		}

		return { entries, truncated };
	}

	async readFile(path: string, ref: string): Promise<string> {
		const url =
			`${this.#apiBase}/projects/${this.#projectId}/repository/files/${encodeURIComponent(path)}/raw` +
			`?ref=${encodeURIComponent(ref)}`;
		const response = await forgeFetch(url, { headers: this.#headers() }, this.#ctx);
		return await response.text();
	}

	/** GitLab rejects writes unless `last_commit_id` matches, so it must be fetched per file. */
	async resolveWriteBase(path: string, ref: string): Promise<string | undefined> {
		const url =
			`${this.#apiBase}/projects/${this.#projectId}/repository/files/${encodeURIComponent(path)}` +
			`?ref=${encodeURIComponent(ref)}`;
		try {
			const meta = await forgeFetchJson<GlFileMeta>(url, { headers: this.#headers() }, this.#ctx);
			return meta.last_commit_id;
		} catch (error) {
			if (error instanceof ForgeError && error.kind === 'not-found') return undefined;
			throw error;
		}
	}

	async writeFile(args: WriteArgs): Promise<WriteResult> {
		if (!this.#token) {
			throw new ForgeError('auth', 'Saving requires an access token.', {
				hint: 'Add a GitLab token with api or write_repository scope in Settings.'
			});
		}

		const body: Record<string, unknown> = {
			branch: args.branch,
			content: args.content,
			commit_message: args.message,
			encoding: 'text'
		};
		if (args.baseSha) body.last_commit_id = args.baseSha;

		await forgeFetch(
			`${this.#apiBase}/projects/${this.#projectId}/repository/files/${encodeURIComponent(args.path)}`,
			{
				method: args.baseSha ? 'PUT' : 'POST',
				headers: this.#headers({ 'Content-Type': 'application/json' }),
				body: JSON.stringify(body)
			},
			this.#ctx
		);

		return {};
	}

	#requireToken(): void {
		if (!this.#token) {
			throw new ForgeError('auth', 'Saving requires an access token.', {
				hint: 'Add a GitLab token with api or write_repository scope in Settings.'
			});
		}
	}

	async deleteFile(args: DeleteArgs): Promise<void> {
		this.#requireToken();
		const body: Record<string, unknown> = {
			branch: args.branch,
			commit_message: args.message
		};
		if (args.baseSha) body.last_commit_id = args.baseSha;

		await forgeFetch(
			`${this.#apiBase}/projects/${this.#projectId}/repository/files/${encodeURIComponent(args.path)}`,
			{
				method: 'DELETE',
				headers: this.#headers({ 'Content-Type': 'application/json' }),
				body: JSON.stringify(body)
			},
			this.#ctx
		);
	}

	async moveFile(args: MoveArgs): Promise<void> {
		this.#requireToken();
		const action: Record<string, unknown> = {
			action: 'move',
			file_path: args.to,
			previous_path: args.from
		};
		if (args.baseSha) action.last_commit_id = args.baseSha;

		await forgeFetch(
			`${this.#apiBase}/projects/${this.#projectId}/repository/commits`,
			{
				method: 'POST',
				headers: this.#headers({ 'Content-Type': 'application/json' }),
				body: JSON.stringify({
					branch: args.branch,
					commit_message: args.message,
					actions: [action]
				})
			},
			this.#ctx
		);
	}
}
