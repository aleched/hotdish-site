import { describe, expect, it } from 'vitest';
import { parseFrontmatter, readStringList, serializeFrontmatter } from './frontmatter';

describe('parseFrontmatter', () => {
	it('splits frontmatter from the body', () => {
		const result = parseFrontmatter('---\ntitle: Cake\ntags: [a, b]\n---\n\n# Cake\n\nBody.');
		expect(result.present).toBe(true);
		expect(result.data.title).toBe('Cake');
		expect(result.data.tags).toEqual(['a', 'b']);
		expect(result.body.trim()).toBe('# Cake\n\nBody.');
	});

	it('handles a document with no frontmatter', () => {
		const result = parseFrontmatter('# Just markdown');
		expect(result.present).toBe(false);
		expect(result.data).toEqual({});
		expect(result.body).toBe('# Just markdown');
	});

	it('reports malformed YAML without losing the body', () => {
		const result = parseFrontmatter('---\ntitle: "unterminated\n---\n\nBody text.');
		expect(result.present).toBe(true);
		expect(result.error).toBeTruthy();
		expect(result.body.trim()).toBe('Body text.');
	});

	it('ignores a --- that is not at the start', () => {
		const result = parseFrontmatter('Intro\n\n---\ntitle: No\n---\n');
		expect(result.present).toBe(false);
	});

	it('handles CRLF line endings', () => {
		const result = parseFrontmatter('---\r\ntitle: Cake\r\n---\r\n\r\nBody.');
		expect(result.data.title).toBe('Cake');
		expect(result.body.trim()).toBe('Body.');
	});

	it('preserves unknown keys through a round trip', () => {
		const source = '---\ntitle: Cake\ncustomKey: keep me\n---\n\nBody.\n';
		const parsed = parseFrontmatter(source);
		const output = serializeFrontmatter(parsed.data, parsed.body);
		expect(parseFrontmatter(output).data).toEqual(parsed.data);
		expect(output).toContain('customKey');
	});

	it('omits the block entirely when there are no fields', () => {
		expect(serializeFrontmatter({}, 'Body.')).toBe('Body.');
	});
});

describe('readStringList', () => {
	it('reads an array', () => {
		expect(readStringList(['a', 'b'])).toEqual(['a', 'b']);
	});

	it('splits a comma-separated string', () => {
		expect(readStringList('a, b , c')).toEqual(['a', 'b', 'c']);
	});

	it('returns an empty list for other types', () => {
		expect(readStringList(undefined)).toEqual([]);
		expect(readStringList(42)).toEqual([]);
	});
});
