import yaml from 'js-yaml';

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
 * thrown so a broken header never prevents a recipe from rendering.
 */
export function parseFrontmatter(source: string): Frontmatter {
	const match = FRONTMATTER_PATTERN.exec(source);
	if (!match) return { data: {}, body: stripBom(source), present: false };

	const body = source.slice(match[0].length);

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

/** Re-attaches frontmatter to a body. An empty mapping omits the block entirely. */
export function serializeFrontmatter(data: Record<string, unknown>, body: string): string {
	const keys = Object.keys(data);
	if (keys.length === 0) return body;

	const yamlText = yaml
		.dump(data, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false })
		.trimEnd();

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
