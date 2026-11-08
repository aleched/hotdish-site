const NAME = 'hotdish-find';
const ACTIVE = 'hotdish-find-active';

type HighlightRegistry = Map<string, unknown>;

function registry(): HighlightRegistry | null {
	if (typeof CSS === 'undefined') return null;
	return (CSS as unknown as { highlights?: HighlightRegistry }).highlights ?? null;
}

/** Scrolls the page so the range sits in the middle of the viewport. */
function centerOnScreen(range: Range): void {
	const rect = range.getBoundingClientRect();
	if (rect.width === 0 && rect.height === 0) {
		range.startContainer.parentElement?.scrollIntoView({ block: 'center' });
		return;
	}
	window.scrollBy({ top: rect.top + rect.height / 2 - window.innerHeight / 2 });
}

/** Matches of the sidebar search inside the open document, and which one is current. */
class DocSearch {
	total = $state(0);
	index = $state(0);
	#ranges: Range[] = [];
	/** Match to show once the given document's highlights are ready, set by a search snippet link. */
	#pending: { path: string; index: number } | null = null;
	/** Identifies the last highlighted document and search, so a rebuild keeps the current match. */
	#key = '';

	/** Requests a match in a document that is about to open. */
	target(path: string, index: number): void {
		this.#pending = { path, index };
	}

	/**
	 * Replaces the matches for `path` and highlights them. Jumps to a requested match, else to the first;
	 * a rebuild for the same document and search (`key`) keeps the current match without scrolling.
	 */
	set(ranges: Range[], path: string, key: string): void {
		const previous = this.index;
		const same = key === this.#key;
		this.#key = key;
		this.#ranges = ranges;
		this.total = ranges.length;
		const highlights = registry();
		const Ctor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
		if (highlights && Ctor) {
			if (ranges.length > 0) highlights.set(NAME, new Ctor(...ranges));
			else highlights.delete(NAME);
		}
		const pending = this.#pending;
		if (pending && pending.path === path) {
			this.#pending = null;
			// Snippets and the rendered page can differ slightly, so never point past the last match.
			this.index = Math.max(0, Math.min(pending.index, ranges.length - 1));
			this.#showCurrent(true);
		} else if (same) {
			this.index = Math.min(previous, Math.max(0, ranges.length - 1));
			this.#showCurrent(false);
		} else {
			this.index = 0;
			this.#showCurrent(true);
		}
	}

	/** Shows the match at `index` in the document that is already open. */
	goTo(index: number): void {
		if (this.total === 0) return;
		this.index = Math.max(0, Math.min(index, this.total - 1));
		this.#showCurrent(true);
	}

	/** Clears everything, including the remembered search; for when the document closes. */
	reset(): void {
		this.clear();
		this.index = 0;
		this.#key = '';
	}

	/** Removes the highlights. The current match is remembered in case the same search is rebuilt. */
	clear(): void {
		this.#ranges = [];
		this.total = 0;
		const highlights = registry();
		highlights?.delete(NAME);
		highlights?.delete(ACTIVE);
	}

	next(): void {
		this.#step(1);
	}

	prev(): void {
		this.#step(-1);
	}

	#step(delta: number): void {
		if (this.total === 0) return;
		this.index = (this.index + delta + this.total) % this.total;
		this.#showCurrent(true);
	}

	#showCurrent(scroll: boolean): void {
		const highlights = registry();
		const Ctor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
		const range = this.#ranges[this.index];
		if (highlights && Ctor) {
			if (range) highlights.set(ACTIVE, new Ctor(range));
			else highlights.delete(ACTIVE);
		}
		if (scroll && range) centerOnScreen(range);
	}
}

export const docSearch = new DocSearch();
