import { describe, expect, it } from 'vitest';
import { normalizeTags, parseDoc, titleFromPath } from './doc';

const entry = { path: 'dinner/pasta-bake.md', sha: 'abc123' };

describe('parseDoc', () => {
	it('prefers the frontmatter title', () => {
		const doc = parseDoc(entry, '---\ntitle: Real Title\n---\n\n# Heading Title\n');
		expect(doc.title).toBe('Real Title');
	});

	it('falls back to the first h1', () => {
		const doc = parseDoc(entry, '# Heading Title\n\nBody');
		expect(doc.title).toBe('Heading Title');
	});

	it('falls back to a humanized filename', () => {
		const doc = parseDoc(entry, 'No title anywhere.');
		expect(doc.title).toBe('Pasta bake');
	});

	it('ignores headings inside fenced code blocks', () => {
		const doc = parseDoc(entry, '```\n# Not a title\n```\n\n# Real\n');
		expect(doc.title).toBe('Real');
	});

	it('normalizes tags and drops duplicates', () => {
		const doc = parseDoc(entry, '---\ntags: [Dinner, dinner, " Quick "]\n---\n');
		expect(doc.tags).toEqual(['Dinner', 'Quick']);
	});

	it('keeps unknown frontmatter fields', () => {
		const doc = parseDoc(entry, '---\ntitle: X\nsource: grandma\n---\n');
		expect(doc.fields.source).toBe('grandma');
	});

	it('still parses when frontmatter is broken', () => {
		const doc = parseDoc(entry, '---\ntitle: "oops\n---\n\nBody');
		expect(doc.frontmatterError).toBeTruthy();
		expect(doc.body.trim()).toBe('Body');
	});
});

describe('titleFromPath', () => {
	it('humanizes dashes and underscores', () => {
		expect(titleFromPath('a/b/slow_cooker-chili.md')).toBe('Slow cooker chili');
	});
});

describe('normalizeTags', () => {
	it('is case-insensitive for duplicates but keeps the first casing', () => {
		expect(normalizeTags(['Vegan', 'vegan', 'VEGAN'])).toEqual(['Vegan']);
	});
});
