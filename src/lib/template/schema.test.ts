import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultTemplateYaml, getDefaultTemplate } from './default';
import { parseTemplate } from './schema';
import { structureDocument } from './parse';
import { scaffoldDoc } from '../editor/scaffold';

describe('template field icons and url type', () => {
	it('reads a known icon and the url type', () => {
		const result = parseTemplate(
			'fields:\n  - key: source\n    type: url\n    icon: link\n  - key: n\n    type: number\n'
		);
		expect(result.error).toBeUndefined();
		expect(result.template?.fields[0]).toMatchObject({ type: 'url', icon: 'link' });
		expect(result.template?.fields[1].icon).toBeUndefined();
	});

	it('ignores an unknown icon with a warning', () => {
		const result = parseTemplate('fields:\n  - key: a\n    icon: nope\n');
		expect(result.template?.fields[0].icon).toBeUndefined();
		expect(result.error).toContain('nope');
	});
});

describe('field groups', () => {
	const yaml = `
fields:
  - key: tags
  - group:
      - key: a
      - key: b
  - key: c
`;

	it('flattens groups into fields and lays them out as rows', () => {
		const template = parseTemplate(yaml).template!;
		expect(template.fields.map((field) => field.key)).toEqual(['tags', 'a', 'b', 'c']);
		expect(template.layout.map((row) => row.map((field) => field.key))).toEqual([
			['tags'],
			['a', 'b'],
			['c']
		]);
	});

	it('warns about a group with fewer than two fields and keeps its field on its own row', () => {
		const result = parseTemplate('fields:\n  - group:\n      - key: a\n');
		expect(result.error).toBeTruthy();
		expect(result.template?.layout).toHaveLength(1);
		expect(result.template?.layout[0]).toHaveLength(1);
	});

	it('ignores a nested group with a dedicated warning', () => {
		const result = parseTemplate(
			'fields:\n  - group:\n      - key: a\n      - key: b\n      - group:\n          - key: x\n          - key: y\n'
		);
		expect(result.template?.fields.map((field) => field.key)).toEqual(['a', 'b']);
		expect(result.error).toContain('nested');
	});

	it('puts servings, prep and cook time on one row in the default template', () => {
		const rows = getDefaultTemplate()!.layout.map((row) => row.map((field) => field.key));
		expect(rows).toContainEqual(['servings', 'prep_time', 'cook_time']);
	});
});

describe('default template', () => {
	it('is the example file and parses without warnings', () => {
		const result = parseTemplate(defaultTemplateYaml);
		expect(result.error).toBeUndefined();
		expect(getDefaultTemplate()).not.toBeNull();
	});
});

describe('scaffoldDoc', () => {
	it('has only a title and tags without a template', () => {
		expect(scaffoldDoc(null)).not.toContain('##');
	});

	it('adds required sections from the template', () => {
		const output = scaffoldDoc(getDefaultTemplate());
		expect(output).toContain('## Ingredients');
		expect(output).not.toContain('## Notes');
	});
});

describe('section type inference', () => {
	it('does not guess a type from the heading', () => {
		const doc = structureDocument('## Ingredients\n', null);
		expect(doc.sections[0].type).toBe('text');
	});
});

describe('template example copies', () => {
	it('keeps the downloadable static example identical to the bundled default', () => {
		const normalize = (text: string) => text.replace(/\r\n/g, '\n');
		const staticCopy = readFileSync(new URL('../../../static/template.example.yml', import.meta.url), 'utf8');
		expect(normalize(staticCopy)).toBe(normalize(defaultTemplateYaml));
	});
});
