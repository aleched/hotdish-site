import { describe, expect, it } from 'vitest';
import { loadYaml } from './yaml';

describe('loadYaml', () => {
	it('is undefined for empty or comment-only input', () => {
		expect(loadYaml('')).toBeUndefined();
		expect(loadYaml('  \n')).toBeUndefined();
		expect(loadYaml('# just a comment\n')).toBeUndefined();
	});

	it('parses a single document', () => {
		expect(loadYaml('title: Cake\ntags: [a, b]\n')).toEqual({ title: 'Cake', tags: ['a', 'b'] });
	});

	it('throws on several documents', () => {
		expect(() => loadYaml('a: 1\n---\nb: 2\n')).toThrow();
	});
});
