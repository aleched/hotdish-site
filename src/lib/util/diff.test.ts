import { describe, expect, it } from 'vitest';
import { diffLines } from './diff';

describe('diffLines', () => {
	it('reports identical input', () => {
		const result = diffLines('a\nb\nc', 'a\nb\nc');
		expect(result.identical).toBe(true);
		expect(result.lines).toEqual([]);
		expect(result.added).toBe(0);
		expect(result.removed).toBe(0);
	});

	it('isolates a changed middle line', () => {
		const result = diffLines('a\nb\nc', 'a\nB\nc');
		expect(result.identical).toBe(false);
		expect(result.added).toBe(1);
		expect(result.removed).toBe(1);
		expect(result.lines.filter((line) => line.kind === 'removed')).toEqual([
			{ kind: 'removed', text: 'b' }
		]);
		expect(result.lines.filter((line) => line.kind === 'added')).toEqual([
			{ kind: 'added', text: 'B' }
		]);
	});

	it('counts pure additions', () => {
		const result = diffLines('a\nb', 'a\nx\ny\nb');
		expect(result.added).toBe(2);
		expect(result.removed).toBe(0);
	});

	it('counts pure removals', () => {
		const result = diffLines('a\nx\ny\nb', 'a\nb');
		expect(result.added).toBe(0);
		expect(result.removed).toBe(2);
	});

	it('handles an empty original', () => {
		const result = diffLines('', 'hello');
		expect(result.removed).toBe(1);
		expect(result.added).toBe(1);
	});
});
