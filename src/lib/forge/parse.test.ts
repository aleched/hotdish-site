import { describe, expect, it } from 'vitest';
import { parseRepoInput } from './parse';

describe('parseRepoInput', () => {
	it('parses a bare owner/repo as GitHub', () => {
		expect(parseRepoInput('alice/recipes')).toEqual({
			kind: 'github',
			host: 'github.com',
			owner: 'alice',
			repo: 'recipes'
		});
	});

	it('parses a GitHub repo URL', () => {
		expect(parseRepoInput('https://github.com/alice/recipes')).toMatchObject({
			kind: 'github',
			owner: 'alice',
			repo: 'recipes'
		});
	});

	it('extracts branch and folder from a GitHub tree URL', () => {
		expect(parseRepoInput('https://github.com/alice/recipes/tree/main/dinner/pasta')).toMatchObject({
			kind: 'github',
			ref: 'main',
			basePath: 'dinner/pasta'
		});
	});

	it('uses the parent folder for a blob URL', () => {
		expect(
			parseRepoInput('https://github.com/alice/recipes/blob/main/dinner/pasta.md')
		).toMatchObject({ ref: 'main', basePath: 'dinner' });
	});

	it('handles GitLab /-/ URLs', () => {
		expect(
			parseRepoInput('https://gitlab.com/group/cookbook/-/tree/main/recipes')
		).toMatchObject({ kind: 'gitlab', owner: 'group', repo: 'cookbook', ref: 'main', basePath: 'recipes' });
	});

	it('handles Gitea /src/branch/ URLs', () => {
		expect(
			parseRepoInput('https://codeberg.org/bob/food/src/branch/main/desserts')
		).toMatchObject({ kind: 'gitea', owner: 'bob', repo: 'food', ref: 'main', basePath: 'desserts' });
	});

	it('treats an unknown host as a self-hosted Gitea instance', () => {
		expect(parseRepoInput('https://git.example.org/team/recipes')).toMatchObject({
			kind: 'gitea',
			host: 'git.example.org'
		});
	});

	it('strips a trailing .git', () => {
		expect(parseRepoInput('https://github.com/alice/recipes.git')).toMatchObject({
			repo: 'recipes'
		});
	});

	it('rejects empty input', () => {
		expect(() => parseRepoInput('   ')).toThrow();
	});
});
