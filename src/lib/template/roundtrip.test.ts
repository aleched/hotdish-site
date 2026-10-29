import { describe, expect, it } from 'vitest';
import { structureDocument } from './parse';
import { serializeDocument } from './serialize';
import { parseTemplate, validateFields, type RecipeTemplate } from './schema';

const TEMPLATE_YAML = `
version: 1
name: Recipe
fields:
  - key: title
    type: text
    required: true
  - key: servings
    type: number
  - key: tags
    type: multi-enum
    options: [dessert, dinner, baking]
    allowCustom: false
sections:
  - id: ingredients
    heading: Ingredients
    type: list
    repeatable: true
  - id: instructions
    heading: Instructions
    type: ordered
    repeatable: true
  - id: notes
    heading: Notes
    type: text
    optional: true
`;

const template = parseTemplate(TEMPLATE_YAML).template as RecipeTemplate;

const RECIPE = `---
title: Chocolate Cake
servings: 12
tags:
  - dessert
  - baking
---

## Ingredients

### Cake Batter

- 2 cups flour
- 1 cup sugar

### Frosting

- 1 cup butter

## Instructions

### Cake Batter

1. Preheat oven to 350°F
2. Mix dry ingredients

## Notes

Best served warm.
`;

describe('template schema', () => {
	it('parses fields and sections', () => {
		expect(template.sections.map((section) => section.id)).toEqual([
			'ingredients',
			'instructions',
			'notes'
		]);
		expect(template.fields.find((field) => field.key === 'tags')?.allowCustom).toBe(false);
	});

	it('degrades to null for unusable YAML rather than throwing', () => {
		expect(parseTemplate('just a string').template).toBeNull();
		expect(parseTemplate(': : :').template).toBeNull();
	});

	it('defaults unknown types instead of failing', () => {
		const result = parseTemplate(
			'sections:\n  - heading: Steps\n    type: carousel\n'
		);
		expect(result.template?.sections[0].type).toBe('text');
		expect(result.error).toMatch(/carousel/);
	});
});

describe('structureDocument', () => {
	it('maps headings onto template sections', () => {
		const doc = structureDocument(RECIPE, template);
		expect(doc.sections.map((section) => section.heading)).toEqual([
			'Ingredients',
			'Instructions',
			'Notes'
		]);
		expect(doc.sections[0].matched).toBe(true);
		expect(doc.sections[0].blocks.map((block) => block.heading)).toEqual([
			'Cake Batter',
			'Frosting'
		]);
		expect(doc.sections[0].blocks[0].items).toEqual(['2 cups flour', '1 cup sugar']);
		expect(doc.sections[1].type).toBe('ordered');
		expect(doc.sections[1].blocks[0].items).toEqual([
			'Preheat oven to 350°F',
			'Mix dry ingredients'
		]);
	});

	it('reads frontmatter fields', () => {
		const doc = structureDocument(RECIPE, template);
		expect(doc.fields.title).toBe('Chocolate Cake');
		expect(doc.fields.servings).toBe(12);
	});

	it('keeps sections the template does not describe', () => {
		const doc = structureDocument(`${RECIPE}\n## Wine Pairing\n\nPinot noir.\n`, template);
		const extra = doc.sections.find((section) => section.heading === 'Wine Pairing');
		expect(extra?.matched).toBe(false);
		expect(extra?.blocks[0].leadingText).toBe('Pinot noir.');
	});

	it('works with no template at all', () => {
		const doc = structureDocument(RECIPE, null);
		expect(doc.sections).toHaveLength(3);
		expect(doc.sections[1].type).toBe('ordered');
		expect(doc.sections.every((section) => section.matched === false)).toBe(true);
	});

	it('ignores headings inside fenced code blocks', () => {
		const doc = structureDocument('## Real\n\n```\n## Fake\n```\n', template);
		expect(doc.sections).toHaveLength(1);
	});

	it('preserves content that appears before the first heading', () => {
		const doc = structureDocument('# Cake\n\nIntro text.\n\n## Ingredients\n\n- flour\n', template);
		expect(doc.preamble).toBe('# Cake\n\nIntro text.');
	});
});

describe('round trip', () => {
	it('is stable through parse -> serialize -> parse', () => {
		const first = structureDocument(RECIPE, template);
		const output = serializeDocument(first);
		const second = structureDocument(output, template);
		expect(second).toEqual(first);
	});

	it('is idempotent on a second serialization', () => {
		const first = structureDocument(RECIPE, template);
		const once = serializeDocument(first);
		const twice = serializeDocument(structureDocument(once, template));
		expect(twice).toBe(once);
	});

	it('never drops unmatched content', () => {
		const source = `${RECIPE}\n## Wine Pairing\n\nPinot noir.\n`;
		const output = serializeDocument(structureDocument(source, template));
		expect(output).toContain('Wine Pairing');
		expect(output).toContain('Pinot noir.');
	});

	it('preserves unknown frontmatter keys', () => {
		const source = '---\ntitle: X\nsource: grandma\n---\n\n## Ingredients\n\n- salt\n';
		const output = serializeDocument(structureDocument(source, template));
		expect(output).toContain('source: grandma');
	});

	it('preserves prose mixed in with a list', () => {
		const source = '## Ingredients\n\nUse good butter.\n\n- 1 cup butter\n\nKeep it cold.\n';
		const doc = structureDocument(source, template);
		expect(doc.sections[0].blocks[0].leadingText).toBe('Use good butter.');
		expect(doc.sections[0].blocks[0].trailingText).toBe('Keep it cold.');

		const output = serializeDocument(doc);
		expect(output).toContain('Use good butter.');
		expect(output).toContain('Keep it cold.');
	});

	it('renumbers ordered lists correctly', () => {
		const source = '## Instructions\n\n1. First\n1. Second\n1. Third\n';
		const output = serializeDocument(structureDocument(source, template));
		expect(output).toContain('1. First');
		expect(output).toContain('2. Second');
		expect(output).toContain('3. Third');
	});
});

describe('validateFields', () => {
	it('flags a missing required field', () => {
		const issues = validateFields(template, {});
		expect(issues.some((issue) => issue.key === 'title')).toBe(true);
	});

	it('flags a value outside a closed enum', () => {
		const issues = validateFields(template, { title: 'X', tags: ['dessert', 'nope'] });
		expect(issues.some((issue) => issue.message.includes('nope'))).toBe(true);
	});

	it('accepts allowed enum values', () => {
		const issues = validateFields(template, { title: 'X', tags: ['dessert'] });
		expect(issues).toHaveLength(0);
	});

	it('returns nothing when there is no template', () => {
		expect(validateFields(null, {})).toEqual([]);
	});
});
