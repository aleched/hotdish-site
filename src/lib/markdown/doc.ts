import type { BlobEntry } from '#lib/forge/types.ts';
import { stripMarkdown } from '#lib/search.ts';
import { parseFrontmatter, readStringList } from './frontmatter';

export interface Doc {
	path: string;
	sha: string;
	title: string;
	tags: string[];
	/** All frontmatter keys, including ones Hotdish does not understand. */
	fields: Record<string, unknown>;
	body: string;
	raw: string;
	frontmatterError?: string;
}

/** Lightweight record used for listings, search and tag filtering. */
export interface DocSummary {
	path: string;
	sha: string;
	title: string;
	tags: string[];
	/** Lowercased title plus tags, precomputed for fast substring search. */
	haystack: string;
	/** Body as shown in the reader (no repeated title heading) with markdown syntax removed, for full-text search and snippets. */
	text: string;
}

export function parseDoc(entry: BlobEntry, raw: string): Doc {
	const { data, body, error } = parseFrontmatter(raw);

	const title =
		readString(data.title) ?? headingTitle(body) ?? titleFromPath(entry.path);
	const tags = normalizeTags(readStringList(data.tags));

	return {
		path: entry.path,
		sha: entry.sha,
		title,
		tags,
		fields: data,
		body,
		raw,
		frontmatterError: error
	};
}

export function toSummary(doc: Doc): DocSummary {
	return {
		path: doc.path,
		sha: doc.sha,
		title: doc.title,
		tags: doc.tags,
		haystack: `${doc.title} ${doc.tags.join(' ')} ${doc.path}`.toLowerCase(),
		text: stripMarkdown(stripLeadingTitle(doc.body, doc.title))
	};
}

/** The reader renders the heading from the title, so a leading `# Title` line that repeats it is dropped. */
export function stripLeadingTitle(body: string, title: string): string {
	const match = /^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\r?\n|$)/.exec(body);
	if (!match) return body;
	if (match[1].trim() !== title) return body;
	return body.slice(match[0].length);
}

export function titleFromPath(path: string): string {
	const fileName = path.split('/').pop() ?? path;
	const stem = fileName.replace(/\.(md|markdown)$/i, '');
	const spaced = stem.replace(/[-_]+/g, ' ').trim();
	if (!spaced) return stem;
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function normalizeTags(tags: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const tag of tags) {
		const trimmed = tag.trim();
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(trimmed);
	}
	return result;
}

export function isMarkdownPath(path: string): boolean {
	return /\.(md|markdown)$/i.test(path);
}

function readString(value: unknown): string | undefined {
	if (typeof value === 'string' && value.trim()) return value.trim();
	if (typeof value === 'number') return String(value);
	return undefined;
}

/** Finds the first level-1 heading, ignoring anything inside fenced code blocks. */
function headingTitle(body: string): string | undefined {
	const withoutFences = body.replace(/^```[\s\S]*?^```[ \t]*$/gm, '');
	const match = /^#[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(withoutFences);
	return match ? match[1].trim() : undefined;
}
