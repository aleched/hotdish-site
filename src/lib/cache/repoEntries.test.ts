import { describe, expect, it } from 'vitest';
import type { RepoRef } from '$lib/forge/types';
import { TEMPLATE_PATH } from '$lib/template/schema';
import { relevantEntries, sameEntries, snapshotKey, splitEntries } from './repoEntries';

const ref: RepoRef = { kind: 'github', host: 'github.com', owner: 'alice', repo: 'recipes' };

describe('snapshotKey', () => {
	it('ignores letter case of host, owner and repo', () => {
		expect(snapshotKey({ ...ref, host: 'GitHub.com', owner: 'Alice', repo: 'Recipes' })).toBe(snapshotKey(ref));
	});

	it('ignores slashes around the base path', () => {
		expect(snapshotKey({ ...ref, basePath: '/docs/' })).toBe(snapshotKey({ ...ref, basePath: 'docs' }));
	});

	it('separates branches and base paths', () => {
		expect(snapshotKey({ ...ref, ref: 'dev' })).not.toBe(snapshotKey(ref));
		expect(snapshotKey({ ...ref, basePath: 'docs' })).not.toBe(snapshotKey(ref));
	});
});

describe('relevantEntries', () => {
	const entries = [
		{ path: 'soup.md', sha: '1', size: 10 },
		{ path: 'docs/pie.markdown', sha: '2' },
		{ path: 'docs/.drafts/x.md', sha: '3' },
		{ path: '.github/README.md', sha: '4' },
		{ path: 'docs/photo.png', sha: '5' },
		{ path: TEMPLATE_PATH, sha: '6' }
	];

	it('keeps visible markdown and the template', () => {
		expect(relevantEntries(entries).map((entry) => entry.path)).toEqual(['soup.md', 'docs/pie.markdown', TEMPLATE_PATH]);
	});

	it('limits markdown to the base path but keeps the template', () => {
		expect(relevantEntries(entries, 'docs/').map((entry) => entry.path)).toEqual(['docs/pie.markdown', TEMPLATE_PATH]);
	});

	it('copies only path, sha and size', () => {
		const [first] = relevantEntries([{ path: 'a.md', sha: '1', size: 3, extra: true } as never]);
		expect(first).toEqual({ path: 'a.md', sha: '1', size: 3 });
	});
});

describe('splitEntries', () => {
	it('separates the template from the documents', () => {
		const template = { path: TEMPLATE_PATH, sha: 't' };
		const doc = { path: 'a.md', sha: '1' };
		expect(splitEntries([doc, template])).toEqual({ markdown: [doc], template });
		expect(splitEntries([doc]).template).toBeUndefined();
	});
});

describe('sameEntries', () => {
	const a = [
		{ path: 'a.md', sha: '1' },
		{ path: 'b.md', sha: '2' }
	];

	it('ignores order', () => {
		expect(sameEntries(a, [...a].reverse())).toBe(true);
	});

	it('detects changed, added and removed files', () => {
		expect(sameEntries(a, [{ path: 'a.md', sha: '1' }, { path: 'b.md', sha: '3' }])).toBe(false);
		expect(sameEntries(a, [...a, { path: 'c.md', sha: '4' }])).toBe(false);
		expect(sameEntries(a, a.slice(1))).toBe(false);
	});
});
