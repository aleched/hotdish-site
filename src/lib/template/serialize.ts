import { serializeFrontmatter } from '$lib/markdown/frontmatter';
import type { StructuredBlock, StructuredDoc, StructuredSection } from './parse';

/**
 * Renders a structured document back to markdown. Output is deliberately plain and idiomatic
 * so the file still reads well on the forge and in any other editor.
 */
export function serializeDocument(doc: StructuredDoc): string {
	const chunks: string[] = [];

	if (doc.preamble.trim()) chunks.push(doc.preamble.trim());

	for (const section of doc.sections) {
		const rendered = serializeSection(section);
		if (rendered) chunks.push(rendered);
	}

	const body = chunks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
	return serializeFrontmatter(doc.fields, body ? `${body}\n` : '');
}

function serializeSection(section: StructuredSection): string {
	const parts: string[] = [`## ${section.heading}`];

	for (const block of section.blocks) {
		const rendered = serializeBlock(block, section.type === 'ordered');
		if (rendered) parts.push(rendered);
	}

	// A heading with no content at all is still emitted so the structure survives a round trip.
	return parts.join('\n\n');
}

function serializeBlock(block: StructuredBlock, ordered: boolean): string {
	const parts: string[] = [];

	if (block.heading) parts.push(`### ${block.heading}`);
	if (block.leadingText.trim()) parts.push(block.leadingText.trim());

	const items = block.items.map((item) => item.trim()).filter(Boolean);
	if (items.length > 0) {
		const lines = items.map((item, index) => {
			const marker = ordered ? `${index + 1}.` : '-';
			const [first, ...rest] = item.split('\n');
			const indent = ' '.repeat(marker.length + 1);
			const continuation = rest.map((line) => `${indent}${line.trim()}`);
			return [`${marker} ${first}`, ...continuation].join('\n');
		});
		parts.push(lines.join('\n'));
	}

	if (block.trailingText.trim()) parts.push(block.trailingText.trim());

	return parts.join('\n\n');
}

/** Splits a textarea value into list items, one per non-empty line. */
export function linesToItems(value: string): string[] {
	return value
		.split('\n')
		.map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim())
		.filter(Boolean);
}

/** Renders list items back into a textarea value, one per line. */
export function itemsToLines(items: readonly string[]): string {
	return items.map((item) => item.replace(/\n/g, ' ')).join('\n');
}
