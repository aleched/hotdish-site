/** Shortest query that is matched against document bodies. */
export const MIN_BODY_QUERY = 2;

export interface Snippet {
	/** Position of this match among all matches in the text, from 0. */
	index: number;
	before: string;
	match: string;
	after: string;
}

/** Light markdown removal so searches and snippets work on what a reader sees. */
export function stripMarkdown(source: string): string {
	return source
		.replace(/^```.*$/gm, '')
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>/g, ' ')
		.replace(/^[ \t]*(?:#{1,6}|>+|[-*+]|\d+[.)])[ \t]+/gm, '')
		.replace(/(\*\*|__|~~|[*_`])/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export interface SearchOptions {
	/** Match upper and lower case exactly. */
	matchCase?: boolean;
	/** Only match where the query is not part of a longer word. */
	wholeWord?: boolean;
}

export interface Match {
	start: number;
	end: number;
}

export function normalizeQuery(query: string): string {
	return query.trim().toLowerCase();
}

export function isSearchableQuery(query: string): boolean {
	return normalizeQuery(query).length >= MIN_BODY_QUERY;
}

/** A global regular expression for the query, or null when it is too short to search bodies. */
export function searchPattern(query: string, options: SearchOptions = {}): RegExp | null {
	const needle = query.trim();
	if (needle.length < MIN_BODY_QUERY) return null;
	const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const source = options.wholeWord ? `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])` : escaped;
	return new RegExp(source, options.matchCase ? 'gu' : 'giu');
}

export function matchesText(text: string, query: string, options: SearchOptions = {}): boolean {
	const pattern = searchPattern(query, options);
	return pattern !== null && pattern.test(text);
}

/** Every non-overlapping occurrence of the query, in order. */
export function findMatches(text: string, query: string, options: SearchOptions = {}): Match[] {
	const pattern = searchPattern(query, options);
	if (!pattern) return [];
	return Array.from(text.matchAll(pattern), (found) => ({
		start: found.index,
		end: found.index + found[0].length
	}));
}

/** One short excerpt per match, each trimmed to about `radius` characters per side. */
export function findSnippets(text: string, query: string, options: SearchOptions = {}, radius = 40): Snippet[] {
	return findMatches(text, query, options).map(({ start: offset, end: matchEnd }, index) => {
		const start = Math.max(0, offset - radius);
		const end = Math.min(text.length, matchEnd + radius);
		return {
			index,
			before: (start > 0 ? '…' : '') + text.slice(start, offset).trimStart(),
			match: text.slice(offset, matchEnd),
			after: text.slice(matchEnd, end).trimEnd() + (end < text.length ? '…' : '')
		};
	});
}
