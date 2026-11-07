import { loadYaml } from '#lib/util/yaml.ts';
import { slugify } from '#lib/paths.ts';
import { m } from '#lib/paraglide/messages.js';
import { isIconName, type IconName } from '#lib/ui/icon-names.ts';

export const TEMPLATE_PATH = '.hotdish/template.yml';

export type FieldType = 'text' | 'number' | 'boolean' | 'enum' | 'multi-enum' | 'url' | 'date';

export interface TemplateField {
	key: string;
	label: string;
	type: FieldType;
	required: boolean;
	options: string[];
	/** When false, values outside `options` are flagged as warnings. */
	allowCustom: boolean;
	icon?: IconName;
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

export interface DocTemplate {
	version: number;
	/** Null when the template file has no `name:`. */
	name: string | null;
	fields: TemplateField[];
	/** Fields grouped into form rows; every field appears exactly once. Fields in a `group` share a row. */
	layout: TemplateField[][];
	sections: TemplateSection[];
}

export interface TemplateParseResult {
	template: DocTemplate | null;
	/** Populated when the template was unusable or partially invalid. */
	error?: string;
}

const FIELD_TYPES: FieldType[] = ['text', 'number', 'boolean', 'enum', 'multi-enum', 'url', 'date'];
const SECTION_TYPES: SectionType[] = ['list', 'ordered', 'text'];

/**
 * Templates are advisory. A malformed template degrades to generic markdown editing rather
 * than blocking the repository, so problems are reported instead of thrown.
 */
export function parseTemplate(raw: string): TemplateParseResult {
	let loaded: unknown;
	try {
		loaded = loadYaml(raw);
	} catch (error) {
		return { template: null, error: error instanceof Error ? error.message : String(error) };
	}

	if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) {
		return { template: null, error: m.template_error_mapping() };
	}

	const source = loaded as Record<string, unknown>;
	const warnings: string[] = [];

	const fields: TemplateField[] = [];
	const layout: TemplateField[][] = [];
	for (const entry of asArray(source.fields)) {
		if (!entry || typeof entry !== 'object') continue;
		const item = entry as Record<string, unknown>;

		if ('group' in item) {
			const members: TemplateField[] = [];
			for (const child of asArray(item.group)) {
				if (!child || typeof child !== 'object') continue;
				if ('group' in child) {
					warnings.push(m.template_warn_group_nested());
					continue;
				}
				const field = parseField(child as Record<string, unknown>, warnings);
				if (field) members.push(field);
			}
			if (members.length < 2) warnings.push(m.template_warn_group_small());
			fields.push(...members);
			// A group of one is just a field; keep each member on its own row.
			if (members.length < 2) layout.push(...members.map((field) => [field]));
			else layout.push(members);
			continue;
		}

		const field = parseField(item, warnings);
		if (!field) continue;
		fields.push(field);
		layout.push([field]);
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
			subheadingLabel: asString(item.subheadingLabel) ?? m.form_section(),
			optional: item.optional === true
		});
	}

	if (fields.length === 0 && sections.length === 0) {
		return { template: null, error: m.template_error_empty() };
	}

	const template: DocTemplate = {
		version: typeof source.version === 'number' ? source.version : 1,
		name: asString(source.name) ?? null,
		fields,
		layout,
		sections
	};

	return { template, error: warnings.length ? warnings.join(' ') : undefined };
}

function parseField(item: Record<string, unknown>, warnings: string[]): TemplateField | null {
	const key = asString(item.key);
	if (!key) {
		warnings.push(m.template_warn_field_no_key());
		return null;
	}
	const type = asString(item.type) as FieldType;
	const resolvedType = FIELD_TYPES.includes(type) ? type : 'text';
	if (type && resolvedType !== type) {
		warnings.push(m.template_warn_field_type({ key, type: String(type) }));
	}
	const iconName = asString(item.icon);
	let icon: IconName | undefined;
	if (iconName) {
		if (isIconName(iconName)) icon = iconName;
		else warnings.push(m.template_warn_field_icon({ key, icon: iconName }));
	}
	return {
		key,
		label: asString(item.label) ?? humanize(key),
		type: resolvedType,
		required: item.required === true,
		options: asArray(item.options).map((option) => String(option)),
		allowCustom: item.allowCustom !== false,
		icon
	};
}

export function findSectionByHeading(
	template: DocTemplate | null,
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

/** Validation produces warnings only — a document that violates the template still renders. */
export function validateFields(
	template: DocTemplate | null,
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
			issues.push({ key: field.key, message: m.validation_required({ label: field.label }) });
			continue;
		}
		if (empty) continue;

		if (field.type === 'number' && Number.isNaN(Number(value))) {
			issues.push({ key: field.key, message: m.validation_number({ label: field.label }) });
		}

		if (field.type === 'date' && !isIsoDate(String(value))) {
			issues.push({ key: field.key, message: m.validation_date({ label: field.label }) });
		}

		if ((field.type === 'enum' || field.type === 'multi-enum') && !field.allowCustom) {
			const values = Array.isArray(value) ? value.map(String) : [String(value)];
			const allowed = field.options.map((option) => option.toLowerCase());
			for (const item of values) {
				if (!allowed.includes(item.toLowerCase())) {
					issues.push({
						key: field.key,
						message: m.validation_not_allowed({ value: item, label: field.label })
					});
				}
			}
		}
	}

	return issues;
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;
	const [year, month, day] = match.slice(1).map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
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
