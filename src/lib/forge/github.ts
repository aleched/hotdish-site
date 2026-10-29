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

interface GhRepo {
	default_branch: string;
}

interface GhTreeEntry {
	path: string;
	type: 'blob' | 'tree' | 'commit';
	sha: string;
	size?: number;
}

interface GhTree {
	tree: GhTreeEntry[];
	truncated: boolean;
}

interface GhWriteResponse {
	content?: { sha?: string } | null;
}

export class GitHubProvider implements ForgeProvider {
	readonly kind = 'github' as const;
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
		return this.ref.host === 'github.com'
			? 'https://api.github.com'
			: `https://${this.ref.host}/api/v3`;
	}

	get #rawBase(): string {
		return this.ref.host === 'github.com'
			? 'https://raw.githubusercontent.com'
			: `https://${this.ref.host}/raw`;
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
		const headers: Record<string, string> = {
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			...extra
		};
		if (this.#token) headers.Authorization = `Bearer ${this.#token}`;
		return headers;
	}

	rateLimit(): RateLimitInfo | null {
		return this.#rateLimit;
	}

	webUrl(path: string, ref: string, isDir = false): string {
		const base = this.ref.host === 'github.com' ? 'https://github.com' : `https://${this.ref.host}`;
		return `${base}/${this.ref.owner}/${this.ref.repo}/${isDir ? 'tree' : 'blob'}/${encodeURIComponent(ref)}/${encodePath(path)}`;
	}

	async resolveDefaultBranch(): Promise<string> {
		const repo = await forgeFetchJson<GhRepo>(
			`${this.#apiBase}/repos/${this.#slug}`,
			{ headers: this.#headers() },
			this.#ctx
		);
		return repo.default_branch;
	}

	async listTree(ref: string): Promise<TreeResult> {
		const tree = await forgeFetchJson<GhTree>(
			`${this.#apiBase}/repos/${this.#slug}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
			{ headers: this.#headers() },
			this.#ctx
		);

		const entries: BlobEntry[] = tree.tree
			.filter((entry) => entry.type === 'blob')
			.map((entry) => ({ path: entry.path, sha: entry.sha, size: entry.size }));

		return { entries, truncated: Boolean(tree.truncated) };
	}

	async readFile(path: string, ref: string): Promise<string> {
		// Unauthenticated reads go through raw.githubusercontent.com, which is CDN-cached and
		// does not consume the API rate limit.
		if (!this.#token) {
			const url = `${this.#rawBase}/${this.ref.owner}/${this.ref.repo}/${encodeURIComponent(ref)}/${encodePath(path)}`;
			const response = await forgeFetch(url, {}, this.#ctx);
			return await response.text();
		}

		const url = `${this.#apiBase}/repos/${this.#slug}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`;
		const response = await forgeFetch(
			url,
			{ headers: this.#headers({ Accept: 'application/vnd.github.raw' }) },
			this.#ctx
		);
		return await response.text();
	}

	async resolveWriteBase(_path: string, _ref: string, knownSha?: string): Promise<string | undefined> {
		return knownSha;
	}

	async writeFile(args: WriteArgs): Promise<WriteResult> {
		if (!this.#token) {
			throw new ForgeError('auth', 'Saving requires an access token.', {
				hint: 'Add a token with Contents: Read and write permission in Settings.'
			});
		}

		const body: Record<string, unknown> = {
			message: args.message,
			content: utf8ToBase64(args.content),
			branch: args.branch
		};
		if (args.baseSha) body.sha = args.baseSha;

		const result = await forgeFetchJson<GhWriteResponse>(
			`${this.#apiBase}/repos/${this.#slug}/contents/${encodePath(args.path)}`,
			{
				method: 'PUT',
				headers: this.#headers({ 'Content-Type': 'application/json' }),
				body: JSON.stringify(body)
			},
			this.#ctx
		);

		return { sha: result.content?.sha };
	}
}

/** Encodes each path segment but keeps `/` separators intact. */
function encodePath(path: string): string {
	return path.split('/').map(encodeURIComponent).join('/');
}
