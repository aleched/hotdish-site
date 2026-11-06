import { parseFrontmatter } from '$lib/markdown/frontmatter';
import { findSectionByHeading, type DocTemplate, type SectionType } from './schema';

export interface StructuredBlock {
	/** `###` sub-heading, e.g. "Cake batter". Absent for a section's leading block. */
	heading?: string;
	items: string[];
	/** Content before the list, preserved verbatim. */
	leadingText: string;
	/** Content after the list, preserved verbatim. */
	trailingText: string;
}

export interface StructuredSection {
	heading: string;
	type: SectionType;
	/** Set when the heading matched a template section. */
	templateId?: string;
	/** False when this section is not described by the template; content is still preserved. */
	matched: boolean;
	blocks: StructuredBlock[];
}

export interface StructuredDoc {
	fields: Record<string, unknown>;
	/** Anything before the first `##` heading, preserved verbatim. */
	preamble: string;
	sections: StructuredSection[];
	frontmatterError?: string;
}

const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)\d+[.)]\s+(.*)$/;

/**
 * Maps a markdown document onto the template's structure. Content that does not match any
 * template section is kept verbatim as an unmatched section rather than dropped — files may be
 * hand-written or produced by other tools, and silent data loss is the worst possible outcome.
 */
export function structureDocument(raw: string, template: DocTemplate | null): StructuredDoc {
	const { data, body, error } = parseFrontmatter(raw);
	const { preamble, parts } = splitByHeading(body, 2);

	const sections: StructuredSection[] = parts.map((part) => {
		const templateSection = findSectionByHeading(template, part.heading);
		const type = templateSection?.type ?? inferType(part.content, part.heading);
		const repeatable = templateSection?.repeatable ?? true;

		return {
			heading: part.heading,
			type,
			templateId: templateSection?.id,
			matched: Boolean(templateSection),
			blocks: buildBlocks(part.content, type, repeatable)
		};
	});

	return { fields: data, preamble, sections, frontmatterError: error };
}

function buildBlocks(content: string, type: SectionType, repeatable: boolean): StructuredBlock[] {
	if (!repeatable) return [parseBlock(content, type)];

	const { preamble, parts } = splitByHeading(content, 3);
	const blocks: StructuredBlock[] = [];

	if (preamble.trim() || parts.length === 0) {
		blocks.push(parseBlock(preamble, type));
	}
	for (const part of parts) {
		blocks.push({ ...parseBlock(part.content, type), heading: part.heading });
	}

	return blocks;
}

function parseBlock(content: string, type: SectionType): StructuredBlock {
	if (type === 'text') {
		return { items: [], leadingText: content.trim(), trailingText: '' };
	}

	const lines = content.split('\n');
	const items: string[] = [];
	const leading: string[] = [];
	const trailing: string[] = [];

	let seenItem = false;
	let inFence = false;

	for (const line of lines) {
		if (isFence(line)) inFence = !inFence;

		const match = inFence ? null : BULLET.exec(line) ?? ORDERED.exec(line);

		if (match) {
			items.push(match[2].trim());
			seenItem = true;
			continue;
		}

		if (!seenItem) {
			leading.push(line);
			continue;
		}

		// An indented continuation belongs to the item above; anything else is trailing content.
		if (/^\s{2,}\S/.test(line) && items.length > 0 && trailing.length === 0) {
			items[items.length - 1] += `\n${line.trim()}`;
			continue;
		}

		trailing.push(line);
	}

	return {
		items,
		leadingText: leading.join('\n').trim(),
		trailingText: trailing.join('\n').trim()
	};
}

function inferType(content: string, heading = ''): SectionType {
	let ordered = 0;
	let bullet = 0;
	let inFence = false;

	for (const line of content.split('\n')) {
		if (isFence(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		if (ORDERED.test(line)) ordered++;
		else if (BULLET.test(line)) bullet++;
	}

	if (ordered === 0 && bullet === 0) {
		// An empty section, like the default scaffold, has nothing to infer from, so go by its name.
		if (content.trim()) return 'text';
		const name = heading.trim().toLowerCase();
		if (name === 'ingredients') return 'list';
		if (name === 'instructions') return 'ordered';
		return 'text';
	}
	return ordered > bullet ? 'ordered' : 'list';
}

export interface HeadingPart {
	heading: string;
	content: string;
}

/** Splits markdown on headings of the given level, ignoring headings inside fenced code. */
export function splitByHeading(
	content: string,
	level: 2 | 3
): { preamble: string; parts: HeadingPart[] } {
	const marker = `${'#'.repeat(level)} `;
	const preamble: string[] = [];
	const parts: { heading: string; lines: string[] }[] = [];
	let current: { heading: string; lines: string[] } | null = null;
	let inFence = false;

	for (const line of content.split('\n')) {
		if (isFence(line)) inFence = !inFence;

		if (!inFence && line.startsWith(marker)) {
			current = {
				heading: line.slice(marker.length).replace(/\s*#+\s*$/, '').trim(),
				lines: []
			};
			parts.push(current);
			continue;
		}

		if (current) current.lines.push(line);
		else preamble.push(line);
	}

	return {
		preamble: preamble.join('\n').trim(),
		parts: parts.map((part) => ({ heading: part.heading, content: part.lines.join('\n').trim() }))
	};
}

function isFence(line: string): boolean {
	return /^\s{0,3}(```|~~~)/.test(line);
}
