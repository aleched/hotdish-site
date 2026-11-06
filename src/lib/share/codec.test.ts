import { describe, expect, it } from 'vitest';
import { decodeSrc, encodeSrc } from './codec';
import type { RepoRef } from '#lib/forge/types.ts';

describe('share codec', () => {
	const cases: RepoRef[] = [
		{ kind: 'github', host: 'github.com', owner: 'alice', repo: 'recipes' },
		{ kind: 'github', host: 'github.com', owner: 'alice', repo: 'recipes', ref: 'main' },
		{
			kind: 'gitlab',
			host: 'gitlab.com',
			owner: 'group',
			repo: 'cookbook',
			ref: 'feature/new-layout',
			basePath: 'recipes/dinner'
		},
		{ kind: 'gitea', host: 'codeberg.org', owner: 'bob', repo: 'food', basePath: 'md' }
	];

	for (const ref of cases) {
		it(`round-trips ${ref.kind}:${ref.owner}/${ref.repo}`, () => {
			expect(decodeSrc(encodeSrc(ref))).toEqual(ref);
		});
	}

	it('produces URL-safe output', () => {
		const encoded = encodeSrc({
			kind: 'gitea',
			host: 'git.example.org',
			owner: 'team',
			repo: 'recipes~2024',
			ref: 'main'
		});
		expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it('rejects an unknown forge', () => {
		const bogus = btoa('svn:example.com/a/b').replace(/=+$/, '');
		expect(() => decodeSrc(bogus)).toThrow(/Unsupported forge/);
	});

	it('rejects malformed input', () => {
		expect(() => decodeSrc(btoa('nonsense').replace(/=+$/, ''))).toThrow();
	});
});
