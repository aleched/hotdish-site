import { describe, expect, it } from 'vitest';
import { strikeKeys } from './strikes';

describe('strikeKeys', () => {
	it('numbers repeated items by occurrence', () => {
		expect(strikeKeys(['salt', 'pepper', 'salt'])).toEqual(['salt#0', 'pepper#0', 'salt#1']);
	});

	it('normalizes whitespace so formatting changes keep the same key', () => {
		expect(strikeKeys(['  1  cup\n flour '])).toEqual(['1 cup flour#0']);
	});

	it('does not shift keys of other items when one is added elsewhere', () => {
		const before = strikeKeys(['a', 'b']);
		const after = strikeKeys(['new', 'a', 'b']);
		expect(after).toContain(before[0]);
		expect(after).toContain(before[1]);
	});
});
