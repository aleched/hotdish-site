import yaml from 'js-yaml';
import { m } from '$lib/paraglide/messages.js';

export interface Frontmatter {
	/** Parsed YAML mapping. Unknown keys are preserved so they survive a round trip. */
	data: Record<string, unknown>;
	/** Markdown body with the frontmatter block removed. */
	body: string;
	/** True when the source actually had a frontmatter block. */
	present: boolean;
	/** Set when the block existed but could not be parsed; the body is still usable. */
	error?: string;
}

const FRONTMATTER_PATTERN = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Splits YAML frontmatter from a markdown document. A malformed block is reported rather than
 * thrown so a broken header never prevents a document from rendering.
 */
export function parseFrontmatter(source: string): Frontmatter {
	const match = FRONTMATTER_PATTERN.exec(source);
	if (!match) return { data: {}, body: stripBom(source), present: false };

	// The blank line after the closing fence is re-added on save, so it isn't part of the body.
	const body = source.slice(match[0].length).replace(/^(?:[ \t]*\r?\n)+/, '');

	try {
		const parsed = yaml.load(match[1]);
		const data =
			parsed && typeof parsed === 'object' && !Array.isArray(parsed)
				? (parsed as Record<string, unknown>)
				: {};
		return { data, body, present: true };
	} catch (error) {
		return {
			data: {},
			body,
			present: true,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

/** Keys shown first, in this order. Anything else keeps its original relative order after them. */
export const FRONTMATTER_ORDER = ['title', 'tags'];

function orderFields(data: Record<string, unknown>): Record<string, unknown> {
	const known = FRONTMATTER_ORDER.filter((key) => key in data);
	const rest = Object.keys(data).filter((key) => !FRONTMATTER_ORDER.includes(key));
	return Object.fromEntries([...known, ...rest].map((key) => [key, data[key]]));
}

/** YAML text for a frontmatter mapping, without the `---` fences. Empty for an empty mapping. */
export function dumpFrontmatter(data: Record<string, unknown>): string {
	if (Object.keys(data).length === 0) return '';
	return yaml
		.dump(orderFields(data), { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false })
		.trimEnd();
}

/** Parses standalone YAML text that must be a mapping (or empty). */
export function parseYamlMapping(text: string): { data: Record<string, unknown> } | { error: string } {
	try {
		const parsed = yaml.load(text);
		if (parsed === undefined || parsed === null) return { data: {} };
		if (typeof parsed !== 'object' || Array.isArray(parsed)) {
			return { error: m.frontmatter_error_pairs() };
		}
		return { data: parsed as Record<string, unknown> };
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}
}

/** Re-attaches frontmatter to a body. An empty mapping omits the block entirely. */
export function serializeFrontmatter(data: Record<string, unknown>, body: string): string {
	const keys = Object.keys(data);
	if (keys.length === 0) return body;

	const yamlText = dumpFrontmatter(data);

	return `---\n${yamlText}\n---\n\n${body.replace(/^\n+/, '')}`;
}

/** Reads a frontmatter value as a string array, tolerating a comma-separated string. */
export function readStringList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map((item) => String(item).trim()).filter(Boolean);
	}
	if (typeof value === 'string') {
		return value
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean);
	}
	return [];
}

function stripBom(value: string): string {
	return value.startsWith('\uFEFF') ? value.slice(1) : value;
}
