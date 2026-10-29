export interface DiffLine {
	kind: 'context' | 'added' | 'removed';
	text: string;
}

export interface DiffSummary {
	lines: DiffLine[];
	added: number;
	removed: number;
	identical: boolean;
}

const CONTEXT = 2;

/**
 * A deliberately simple line diff: it trims the common prefix and suffix and shows the middle as
 * a removed block followed by an added block. It exists so a save can never be a blind write —
 * the point is to let a human spot unexpected loss, not to be a minimal edit script.
 */
export function diffLines(before: string, after: string): DiffSummary {
	const a = before.split('\n');
	const b = after.split('\n');

	let start = 0;
	while (start < a.length && start < b.length && a[start] === b[start]) start++;

	let end = 0;
	while (
		end < a.length - start &&
		end < b.length - start &&
		a[a.length - 1 - end] === b[b.length - 1 - end]
	) {
		end++;
	}

	const removed = a.slice(start, a.length - end);
	const added = b.slice(start, b.length - end);

	if (removed.length === 0 && added.length === 0) {
		return { lines: [], added: 0, removed: 0, identical: true };
	}

	const lines: DiffLine[] = [];
	for (const text of a.slice(Math.max(0, start - CONTEXT), start)) {
		lines.push({ kind: 'context', text });
	}
	for (const text of removed) lines.push({ kind: 'removed', text });
	for (const text of added) lines.push({ kind: 'added', text });
	for (const text of a.slice(a.length - end, a.length - end + CONTEXT)) {
		lines.push({ kind: 'context', text });
	}

	return { lines, added: added.length, removed: removed.length, identical: false };
}
