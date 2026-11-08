import { describe, expect, it } from 'vitest';
import {
	findMatches,
	findSnippets,
	isSearchableQuery,
	matchesText,
	stripMarkdown
} from './search';

describe('stripMarkdown', () => {
	it('removes common syntax', () => {
		const text = stripMarkdown('# Soup\n\n- **Stir** the [pot](http://x.y) well\n1. `Serve`');
		expect(text).toBe('Soup Stir the pot well Serve');
	});

	it('keeps image alt text', () => {
		expect(stripMarkdown('![a cat](c.png) sits')).toBe('a cat sits');
	});
});

describe('matching', () => {
	it('is case-insensitive', () => {
		expect(matchesText('Slow Cooker Chili', 'cooker')).toBe(true);
	});

	it('ignores queries shorter than the minimum', () => {
		expect(matchesText('abc', 'a')).toBe(false);
		expect(isSearchableQuery(' a ')).toBe(false);
		expect(isSearchableQuery('ab')).toBe(true);
	});

	it('treats regex characters literally', () => {
		expect(matchesText('1.5 cups (about)', '(about)')).toBe(true);
		expect(matchesText('abc', 'a.')).toBe(false);
	});
});

describe('options', () => {
	it('matches case exactly when asked', () => {
		expect(matchesText('Slow Cooker', 'cooker', { matchCase: true })).toBe(false);
		expect(matchesText('Slow Cooker', 'Cooker', { matchCase: true })).toBe(true);
	});

	it('matches whole words only when asked', () => {
		expect(matchesText('tablespoon', 'table', { wholeWord: true })).toBe(false);
		expect(matchesText('the table, set', 'table', { wholeWord: true })).toBe(true);
		expect(matchesText('crème brûlée', 'crème', { wholeWord: true })).toBe(true);
		expect(matchesText('crèmes', 'crème', { wholeWord: true })).toBe(false);
	});

	it('allows punctuation at the edges of a whole-word query', () => {
		expect(matchesText('1.5 cups (about) water', '(about)', { wholeWord: true })).toBe(true);
	});
});

describe('findMatches', () => {
	it('finds all non-overlapping hits', () => {
		expect(findMatches('Aaaa aa', 'aa')).toEqual([
			{ start: 0, end: 2 },
			{ start: 2, end: 4 },
			{ start: 5, end: 7 }
		]);
	});

	it('returns nothing for a too-short query', () => {
		expect(findMatches('abc', 'a')).toEqual([]);
	});
});

describe('findSnippets', () => {
	const text = `${'x'.repeat(100)} needle ${'y'.repeat(100)} needle end`;

	it('trims around the match with ellipses', () => {
		const [first] = findSnippets(text, 'NEEDLE', {}, 10);
		expect(first.match).toBe('needle');
		expect(first.before.startsWith('…')).toBe(true);
		expect(first.after.endsWith('…')).toBe(true);
	});

	it('returns one snippet per match, numbered in order', () => {
		const snippets = findSnippets('needle needle needle', 'needle', {}, 40);
		expect(snippets.map((snippet) => snippet.index)).toEqual([0, 1, 2]);
		expect(snippets[1].before).toBe('needle ');
	});
});
