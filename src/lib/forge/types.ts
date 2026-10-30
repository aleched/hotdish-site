export type ForgeKind = 'github' | 'gitlab' | 'gitea';

export interface RepoRef {
	kind: ForgeKind;
	/** Host of the forge, e.g. `github.com`, `codeberg.org`, `git.example.org`. */
	host: string;
	owner: string;
	repo: string;
	/** Branch, tag or commit. Resolved lazily when omitted. */
	ref?: string;
	/** Optional sub-folder within the repo that holds recipes. */
	basePath?: string;
}

export interface BlobEntry {
	path: string;
	/** Content-addressed id. Changes if and only if the file content changes. */
	sha: string;
	size?: number;
}

export interface TreeResult {
	entries: BlobEntry[];
	/** True when the forge truncated the listing (very large repos). */
	truncated: boolean;
}

export interface RateLimitInfo {
	limit: number | null;
	remaining: number | null;
	resetAt: Date | null;
}

export interface WriteArgs {
	path: string;
	content: string;
	/** Blob sha (or GitLab `last_commit_id`) the edit is based on. Omit to create. */
	baseSha?: string;
	message: string;
	branch: string;
}

export interface WriteResult {
	/** New blob sha, when the forge reports one. */
	sha?: string;
}

export interface DeleteArgs {
	path: string;
	/** Value from `resolveWriteBase`, guarding against deleting a newer version. */
	baseSha?: string;
	message: string;
	branch: string;
}

export interface MoveArgs {
	from: string;
	to: string;
	/** Current file content; forges that cannot move without re-sending it need this. */
	content: string;
	/** Value from `resolveWriteBase` for `from`. */
	baseSha?: string;
	message: string;
	branch: string;
}

export interface ForgeProvider {
	readonly kind: ForgeKind;
	readonly ref: RepoRef;
	/** True when a token is configured, which also enables private repo access. */
	readonly authenticated: boolean;

	resolveDefaultBranch(): Promise<string>;
	listTree(ref: string): Promise<TreeResult>;
	readFile(path: string, ref: string): Promise<string>;
	writeFile(args: WriteArgs): Promise<WriteResult>;
	deleteFile(args: DeleteArgs): Promise<void>;
	/** Moves or renames a file in a single commit. The content is unchanged. */
	moveFile(args: MoveArgs): Promise<void>;

	/**
	 * Returns the value to send as the write precondition. GitHub and Gitea use the blob sha
	 * already known from the tree listing; GitLab needs `last_commit_id`, which costs a request.
	 */
	resolveWriteBase(path: string, ref: string, knownSha?: string): Promise<string | undefined>;

	/** Most recent rate limit snapshot, if the forge reports one. */
	rateLimit(): RateLimitInfo | null;
	/** Human-facing URL for a file, used for "view on forge" links. */
	webUrl(path: string, ref: string, isDir?: boolean): string;
}
