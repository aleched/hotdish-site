import yaml from 'js-yaml';
import { m } from '$lib/paraglide/messages.js';

export const TEMPLATE_PATH = '.hotdish/template.yml';

export type FieldType = 'text' | 'number' | 'boolean' | 'enum' | 'multi-enum';

export interface TemplateField {
	key: string;
	label: string;
	type: FieldType;
	required: boolean;
	options: string[];
	/** When false, values outside `options` are flagged as warnings. */
	allowCustom: boolean;
}

export type SectionType = 'list' | 'ordered' | 'text';

export interface TemplateSection {
	id: string;
	heading: string;
	type: SectionType;
	/** Allows `###` sub-headings, e.g. "Cake batter" and "Frosting". */
	repeatable: boolean;
	subheadingLabel: string;
	optional: boolean;
}

export interface RecipeTemplate {
	version: number;
	name: string;
	fields: TemplateField[];
	sections: TemplateSection[];
}

export interface TemplateParseResult {
	template: RecipeTemplate | null;
	/** Populated when the template was unusable or partially invalid. */
	error?: string;
}

const FIELD_TYPES: FieldType[] = ['text', 'number', 'boolean', 'enum', 'multi-enum'];
const SECTION_TYPES: SectionType[] = ['list', 'ordered', 'text'];

/**
 * Templates are advisory. A malformed template degrades to generic markdown editing rather
 * than blocking the repository, so problems are reported instead of thrown.
 */
export function parseTemplate(raw: string): TemplateParseResult {
	let loaded: unknown;
	try {
		loaded = yaml.load(raw);
	} catch (error) {
		return { template: null, error: error instanceof Error ? error.message : String(error) };
	}

	if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) {
		return { template: null, error: m.template_error_mapping() };
	}

	const source = loaded as Record<string, unknown>;
	const warnings: string[] = [];

	const fields: TemplateField[] = [];
	for (const entry of asArray(source.fields)) {
		if (!entry || typeof entry !== 'object') continue;
		const item = entry as Record<string, unknown>;
		const key = asString(item.key);
		if (!key) {
			warnings.push(m.template_warn_field_no_key());
			continue;
		}
		const type = asString(item.type) as FieldType;
		const resolvedType = FIELD_TYPES.includes(type) ? type : 'text';
		if (type && resolvedType !== type) {
			warnings.push(m.template_warn_field_type({ key, type: String(type) }));
		}
		fields.push({
			key,
			label: asString(item.label) ?? humanize(key),
			type: resolvedType,
			required: item.required === true,
			options: asArray(item.options).map((option) => String(option)),
			allowCustom: item.allowCustom !== false
		});
	}

	const sections: TemplateSection[] = [];
	for (const entry of asArray(source.sections)) {
		if (!entry || typeof entry !== 'object') continue;
		const item = entry as Record<string, unknown>;
		const heading = asString(item.heading);
		if (!heading) {
			warnings.push(m.template_warn_section_no_heading());
			continue;
		}
		const type = asString(item.type) as SectionType;
		const resolvedType = SECTION_TYPES.includes(type) ? type : 'text';
		if (type && resolvedType !== type) {
			warnings.push(m.template_warn_section_type({ heading, type: String(type) }));
		}
		sections.push({
			id: asString(item.id) ?? slugify(heading),
			heading,
			type: resolvedType,
			repeatable: item.repeatable === true,
			subheadingLabel: asString(item.subheadingLabel) ?? 'Section',
			optional: item.optional === true
		});
	}

	if (fields.length === 0 && sections.length === 0) {
		return { template: null, error: m.template_error_empty() };
	}

	const template: RecipeTemplate = {
		version: typeof source.version === 'number' ? source.version : 1,
		name: asString(source.name) ?? 'Recipe',
		fields,
		sections
	};

	return { template, error: warnings.length ? warnings.join(' ') : undefined };
}

export function findSectionByHeading(
	template: RecipeTemplate | null,
	heading: string
): TemplateSection | undefined {
	if (!template) return undefined;
	const needle = heading.trim().toLowerCase();
	return template.sections.find((section) => section.heading.trim().toLowerCase() === needle);
}

export interface FieldIssue {
	key: string;
	message: string;
}

/** Validation produces warnings only — a recipe that violates the template still renders. */
export function validateFields(
	template: RecipeTemplate | null,
	fields: Record<string, unknown>
): FieldIssue[] {
	if (!template) return [];
	const issues: FieldIssue[] = [];

	for (const field of template.fields) {
		const value = fields[field.key];
		const empty =
			value === undefined || value === null || (typeof value === 'string' && !value.trim()) ||
			(Array.isArray(value) && value.length === 0);

		if (field.required && empty) {
			issues.push({ key: field.key, message: `${field.label} is required.` });
			continue;
		}
		if (empty) continue;

		if (field.type === 'number' && Number.isNaN(Number(value))) {
			issues.push({ key: field.key, message: `${field.label} should be a number.` });
		}

		if ((field.type === 'enum' || field.type === 'multi-enum') && !field.allowCustom) {
			const values = Array.isArray(value) ? value.map(String) : [String(value)];
			const allowed = field.options.map((option) => option.toLowerCase());
			for (const item of values) {
				if (!allowed.includes(item.toLowerCase())) {
					issues.push({
						key: field.key,
						message: `"${item}" is not one of the allowed ${field.label} values.`
					});
				}
			}
		}
	}

	return issues;
}

export function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function humanize(value: string): string {
	const spaced = value.replace(/[-_]+/g, ' ').trim();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
	if (typeof value === 'string' && value.trim()) return value.trim();
	return undefined;
}
