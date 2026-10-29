import { utf8ToBase64 } from '$lib/util/base64';
import { ForgeError } from './errors';
import { forgeFetch, forgeFetchJson, readRateLimit } from './http';
import type {
	BlobEntry,
	ForgeProvider,
	RateLimitInfo,
	RepoRef,
	TreeResult,
	WriteArgs,
	WriteResult
} from './types';

interface GiteaRepo {
	default_branch: string;
}

interface GiteaTreeEntry {
	path: string;
	type: 'blob' | 'tree' | 'commit';
	sha: string;
	size?: number;
}

interface GiteaTree {
	tree: GiteaTreeEntry[] | null;
	truncated?: boolean;
	total_count?: number;
	page?: number;
}

interface GiteaWriteResponse {
	content?: { sha?: string } | null;
}

const TREE_PAGE_SIZE = 1000;

/**
 * Gitea and Forgejo expose a deliberately GitHub-shaped API, so this is largely a base URL
 * swap. The notable differences are `token` auth and paginated tree listings.
 */
export class GiteaProvider implements ForgeProvider {
	readonly kind = 'gitea' as const;
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
		return `https://${this.ref.host}/api/v1`;
	}

	get #slug(): string {
		return `${encodeURIComponent(this.ref.owner)}/${encodeURIComponent(this.ref.repo)}`;
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
		if (this.#token) headers.Authorization = `token ${this.#token}`;
		return headers;
	}

	rateLimit(): RateLimitInfo | null {
		return this.#rateLimit;
	}

	webUrl(path: string, ref: string, _isDir = false): string {
		return `https://${this.ref.host}/${this.ref.owner}/${this.ref.repo}/src/branch/${encodeURIComponent(ref)}/${encodePath(path)}`;
	}

	async resolveDefaultBranch(): Promise<string> {
		const repo = await forgeFetchJson<GiteaRepo>(
			`${this.#apiBase}/repos/${this.#slug}`,
			{ headers: this.#headers() },
			this.#ctx
		);
		return repo.default_branch;
	}

	async listTree(ref: string): Promise<TreeResult> {
		const entries: BlobEntry[] = [];
		let truncated = false;

		for (let page = 1; ; page++) {
			const url =
				`${this.#apiBase}/repos/${this.#slug}/git/trees/${encodeURIComponent(ref)}` +
				`?recursive=true&per_page=${TREE_PAGE_SIZE}&page=${page}`;
			const tree = await forgeFetchJson<GiteaTree>(url, { headers: this.#headers() }, this.#ctx);
			const batch = tree.tree ?? [];

			for (const entry of batch) {
				if (entry.type === 'blob') {
					entries.push({ path: entry.path, sha: entry.sha, size: entry.size });
				}
			}

			truncated = truncated || Boolean(tree.truncated);
			const total = tree.total_count ?? 0;

			if (batch.length === 0 || batch.length < TREE_PAGE_SIZE) break;
			if (total && page * TREE_PAGE_SIZE >= total) break;
			if (page >= 50) {
				truncated = true;
				break;
			}
		}

		return { entries, truncated };
	}

	async readFile(path: string, ref: string): Promise<string> {
		const url = `${this.#apiBase}/repos/${this.#slug}/raw/${encodePath(path)}?ref=${encodeURIComponent(ref)}`;
		const response = await forgeFetch(url, { headers: this.#headers() }, this.#ctx);
		return await response.text();
	}

	async resolveWriteBase(_path: string, _ref: string, knownSha?: string): Promise<string | undefined> {
		return knownSha;
	}

	async writeFile(args: WriteArgs): Promise<WriteResult> {
		if (!this.#token) {
			throw new ForgeError('auth', 'Saving requires an access token.', {
				hint: 'Add a Gitea token with repository write access in Settings.'
			});
		}

		const body: Record<string, unknown> = {
			message: args.message,
			content: utf8ToBase64(args.content),
			branch: args.branch
		};
		if (args.baseSha) body.sha = args.baseSha;

		const result = await forgeFetchJson<GiteaWriteResponse>(
			`${this.#apiBase}/repos/${this.#slug}/contents/${encodePath(args.path)}`,
			{
				method: args.baseSha ? 'PUT' : 'POST',
				headers: this.#headers({ 'Content-Type': 'application/json' }),
				body: JSON.stringify(body)
			},
			this.#ctx
		);

		return { sha: result.content?.sha };
	}
}

function encodePath(path: string): string {
	return path.split('/').map(encodeURIComponent).join('/');
}
