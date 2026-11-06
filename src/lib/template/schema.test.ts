import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultTemplateYaml, getDefaultTemplate, noteTemplateYaml } from './default';
import { isIsoDate, parseTemplate, validateFields } from './schema';
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

describe('date fields', () => {
	const template = parseTemplate('fields:\n  - key: when\n    label: When\n    type: date\n    icon: calendar\n').template;

	it('reads the date type', () => {
		expect(template?.fields[0]).toMatchObject({ type: 'date', icon: 'calendar' });
	});

	it('accepts real calendar dates only', () => {
		expect(isIsoDate('2026-11-06')).toBe(true);
		expect(isIsoDate('2024-02-29')).toBe(true);
		expect(isIsoDate('2026-02-30')).toBe(false);
		expect(isIsoDate('2026-13-01')).toBe(false);
		expect(isIsoDate('11/06/2026')).toBe(false);
		expect(isIsoDate('2026-1-6')).toBe(false);
	});

	it('warns about a value that is not a date and ignores an empty one', () => {
		expect(validateFields(template, { when: 'soon' })).toHaveLength(1);
		expect(validateFields(template, { when: '2026-11-06' })).toEqual([]);
		expect(validateFields(template, {})).toEqual([]);
	});

	it('names the field in the date warning', () => {
		expect(validateFields(template, { when: 'soon' })[0].message).toContain('When');
	});
});

describe('validation messages', () => {
	const template = parseTemplate(
		'fields:\n  - key: title\n    label: Title\n    required: true\n  - key: serves\n    label: Serves\n    type: number\n  - key: course\n    label: Course\n    type: enum\n    options: [main, side]\n    allowCustom: false\n'
	).template;

	it('names the field in each warning', () => {
		const issues = validateFields(template, { serves: 'lots', course: 'dessert' });
		expect(issues.map((issue) => issue.key)).toEqual(['title', 'serves', 'course']);
		expect(issues[0].message).toContain('Title');
		expect(issues[1].message).toContain('Serves');
		expect(issues[2].message).toContain('dessert');
		expect(issues[2].message).toContain('Course');
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

describe('template name', () => {
	it('is null when the file has no name', () => {
		expect(parseTemplate('version: 1').template?.name).toBeNull();
	});
});

describe('default template', () => {
	it('is the example file and parses without warnings', () => {
		const result = parseTemplate(defaultTemplateYaml);
		expect(result.error).toBeUndefined();
		expect(getDefaultTemplate()).not.toBeNull();
	});
});

describe('note template', () => {
	it('parses without warnings and groups date with status', () => {
		const result = parseTemplate(noteTemplateYaml);
		expect(result.error).toBeUndefined();
		expect(result.template?.name).toBe('Note');
		const rows = getDefaultTemplate('note')!.layout.map((row) => row.map((field) => field.key));
		expect(rows).toContainEqual(['date', 'status']);
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
	const normalize = (text: string) => text.replace(/\r\n/g, '\n');
	const staticFile = (path: string) =>
		readFileSync(new URL('../../../static/' + path, import.meta.url), 'utf8');

	it('keeps the downloadable static example identical to the bundled default', () => {
		expect(normalize(staticFile('template/recipe.yml'))).toBe(normalize(defaultTemplateYaml));
	});

	it('keeps the downloadable note template identical to the bundled one', () => {
		expect(normalize(staticFile('template/note.yml'))).toBe(normalize(noteTemplateYaml));
	});

	it.each(['project', 'travel', 'fitness', 'journal'])('parses the %s example without warnings', (name) => {
		const result = parseTemplate(staticFile('template/' + name + '.yml'));
		expect(result.error).toBeUndefined();
		expect(result.template).not.toBeNull();
	});
});
