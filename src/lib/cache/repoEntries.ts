import type { BlobEntry, RepoRef } from '#lib/forge/types.ts';
import { isMarkdownPath } from '#lib/markdown/doc.ts';
import { TEMPLATE_PATH } from '#lib/template/schema.ts';

// Pure helpers for repository snapshots, kept apart from IndexedDB so they can be unit tested.

/** Independent of the token, so a private repository still opens offline after a reload. */
export function snapshotKey(ref: RepoRef): string {
	return [
		ref.kind,
		ref.host.toLowerCase(),
		ref.owner.toLowerCase(),
		ref.repo.toLowerCase(),
		ref.ref ?? '',
		(ref.basePath ?? '').replace(/^\/+|\/+$/g, '')
	].join('\u0000');
}

function isVisibleMarkdown(path: string, prefix: string): boolean {
	return (
		isMarkdownPath(path) &&
		!path.startsWith('.') &&
		!path.includes('/.') &&
		(!prefix || path.startsWith(prefix))
	);
}

/** Keeps only what the site uses: visible markdown under the base path and the template. */
export function relevantEntries(entries: BlobEntry[], basePath?: string): BlobEntry[] {
	const prefix = basePath ? `${basePath.replace(/\/+$/, '')}/` : '';
	return entries
		.filter((entry) => entry.path === TEMPLATE_PATH || isVisibleMarkdown(entry.path, prefix))
		.map((entry) => ({ path: entry.path, sha: entry.sha, ...(entry.size !== undefined ? { size: entry.size } : {}) }));
}

/** Splits relevant entries into the markdown documents and the template entry. */
export function splitEntries(entries: BlobEntry[]): { markdown: BlobEntry[]; template?: BlobEntry } {
	const template = entries.find((entry) => entry.path === TEMPLATE_PATH);
	return { markdown: entries.filter((entry) => entry.path !== TEMPLATE_PATH), template };
}

/** True when two listings hold the same files at the same versions, in any order. */
export function sameEntries(a: BlobEntry[], b: BlobEntry[]): boolean {
	if (a.length !== b.length) return false;
	const shas = new Map(a.map((entry) => [entry.path, entry.sha]));
	return b.every((entry) => shas.get(entry.path) === entry.sha);
}
