/**
 * Stable keys for list items, so struck-through state survives edits elsewhere in a document.
 * Identical item text is told apart by its occurrence order.
 */
export function strikeKeys(texts: readonly string[]): string[] {
	const seen = new Map<string, number>();
	return texts.map((raw) => {
		const text = raw.replace(/\s+/g, ' ').trim();
		const count = seen.get(text) ?? 0;
		seen.set(text, count + 1);
		return `${text}#${count}`;
	});
}
