import { editorPrefs } from '#lib/store/editorPrefs.svelte.ts';

export const FRACTIONS: Record<string, string> = {
	'1/2': '½',
	'1/3': '⅓',
	'2/3': '⅔',
	'1/4': '¼',
	'3/4': '¾',
	'1/5': '⅕',
	'2/5': '⅖',
	'3/5': '⅗',
	'4/5': '⅘',
	'1/6': '⅙',
	'5/6': '⅚',
	'1/8': '⅛',
	'3/8': '⅜',
	'5/8': '⅝',
	'7/8': '⅞'
};

/** Matches a typed fraction at the end of `before`, standing alone after whitespace or the start. */
export const FRACTION_AT_END = /(^|[\s(])(\d\/\d)$/;

/**
 * Called with the text before the cursor, excluding the trigger character (space/newline).
 * Returns the replacement for the fraction at its end, or null.
 */
export function fractionBefore(before: string): { length: number; replacement: string } | null {
	if (!editorPrefs.fractions) return null;
	const match = FRACTION_AT_END.exec(before);
	const replacement = match && FRACTIONS[match[2]];
	return replacement ? { length: match![2].length, replacement } : null;
}
