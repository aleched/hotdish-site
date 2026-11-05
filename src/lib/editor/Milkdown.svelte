<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import '@milkdown/crepe/theme/common/style.css';
	import '@milkdown/crepe/theme/frame.css';
	import { fractionBefore } from '$lib/editor/fractions';
	import Loading from '$lib/ui/Loading.svelte';

	interface CrepeLike {
		create(): Promise<unknown>;
		getMarkdown(): string;
		destroy(): void | Promise<void>;
		on(callback: (listener: { markdownUpdated: (cb: () => void) => void }) => void): unknown;
	}

	interface Props {
		value: string;
		onchange?: (markdown: string) => void;
	}

	let { value, onchange }: Props = $props();

	let container = $state<HTMLDivElement | null>(null);
	let error = $state<string | null>(null);
	let ready = $state(false);

	let crepe: CrepeLike | null = null;
	// Crepe re-serializes markdown on load (list markers, escaping, spacing). Until the user
	// really edits, the original text is reported so opening the editor is never "unsaved".
	let baseline: string | null = null;

	function original(markdown: string): string {
		return baseline !== null && markdown === baseline ? value : markdown;
	}

	export function getMarkdown(): string | null {
		try {
			return crepe ? original(crepe.getMarkdown()) : null;
		} catch {
			return null;
		}
	}

	export function isReady(): boolean {
		return ready;
	}

	/** Turns a typed fraction such as 3/4 into ¾ when space is pressed (not inside code). */
	function onKeydown(event: KeyboardEvent) {
		if (event.key !== ' ' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
		const selection = window.getSelection();
		if (!selection || !selection.isCollapsed || !selection.anchorNode) return;
		const node = selection.anchorNode;
		if (node.nodeType !== Node.TEXT_NODE) return;
		if (node.parentElement?.closest('pre, code')) return;
		const offset = selection.anchorOffset;
		const found = fractionBefore((node.textContent ?? '').slice(0, offset));
		if (!found) return;
		const range = document.createRange();
		range.setStart(node, offset - found.length);
		range.setEnd(node, offset);
		selection.removeAllRanges();
		selection.addRange(range);
		document.execCommand('insertText', false, found.replacement);
	}

	onMount(async () => {
		if (!container) return;
		container.addEventListener('keydown', onKeydown, true);
		try {
			const { Crepe } = await import('@milkdown/crepe');
			const instance = new Crepe({ root: container, defaultValue: value }) as unknown as CrepeLike;

			try {
				instance.on((listener) => {
					listener.markdownUpdated(() => {
						if (baseline === null) return;
						onchange?.(original(instance.getMarkdown()));
					});
				});
			} catch {
				// Change notifications are an optimisation; markdown is read again at save time.
			}

			await instance.create();
			crepe = instance;
			baseline = instance.getMarkdown();
			ready = true;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		}
	});

	onDestroy(() => {
		container?.removeEventListener('keydown', onKeydown, true);
		void crepe?.destroy();
		crepe = null;
	});
</script>

{#if error}
	<p class="banner error">
		The rich text editor could not start ({error}). Use the Markdown tab instead — it edits the
		same content.
	</p>
{/if}

<div class="host" bind:this={container}></div>

{#if !ready && !error}
	<Loading label="Starting editor" />
{/if}

<style>
	.host {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		min-height: 320px;
	}
	.host :global(.milkdown),
	.host :global(.milkdown .editor) {
		border-radius: var(--radius-sm);
	}
	/* Crepe pads the editor by 60px/120px by default; keep just room for the block handle. */
	.host :global(.milkdown .ProseMirror) {
		padding: 0.3rem 0.75rem 0.5rem 5.5rem;
		font-family: var(--font);
		font-size: 1rem;
		line-height: 1.7;
	}
	.host :global(.milkdown .ProseMirror h1),
	.host :global(.milkdown .ProseMirror h2),
	.host :global(.milkdown .ProseMirror h3),
	.host :global(.milkdown .ProseMirror h4) {
		font-family: var(--font);
		font-weight: bold;
		line-height: 1.3;
		margin: 1.6em 0 0.5em;
	}
	.host :global(.milkdown .ProseMirror h1) {
		font-size: 2em;
	}
	.host :global(.milkdown .ProseMirror h2) {
		font-size: 1.5em;
		border-bottom: 1px solid var(--border);
		padding-bottom: 0.2em;
	}
	.host :global(.milkdown .ProseMirror h3) {
		font-size: 1.17em;
	}
	.host :global(.milkdown .ProseMirror h4) {
		font-size: 1em;
	}
	.host :global(.milkdown .ProseMirror > :first-child) {
		margin-top: 0;
	}
	.host :global(.milkdown .ProseMirror p),
	.host :global(.milkdown .ProseMirror li) {
		font-size: 1rem;
		line-height: 1.7;
	}
	/* Bullets and numbers use the faded outline colour by default; match the text instead. */
	.host :global(.milkdown .ProseMirror .milkdown-list-item-block .label-wrapper),
	.host :global(.milkdown .ProseMirror .milkdown-list-item-block .label-wrapper *),
	.host :global(.milkdown .ProseMirror .milkdown-list-item-block .label-wrapper svg),
	.host :global(.milkdown .ProseMirror .milkdown-list-item-block .label-wrapper svg *) {
		fill: var(--text);
	}
	.host :global(.milkdown .ProseMirror .milkdown-icon.label.bullet),
	.host :global(.milkdown .ProseMirror .milkdown-icon.label.bullet svg),
	.host :global(.milkdown .ProseMirror .milkdown-icon.label.bullet svg *) {
		color: var(--text) !important;
		fill: var(--text) !important;
		opacity: 1 !important;
	}
	.host :global(.milkdown .ProseMirror .milkdown-icon.label.bullet::before),
	.host :global(.milkdown .ProseMirror .milkdown-icon.label.bullet::after) {
		background-color: var(--text);
		color: var(--text);
	}
	.host :global(.milkdown) {
		--crepe-color-outline: var(--text);
	}
	.host :global(.milkdown .ProseMirror .milkdown-list-item-block .label-wrapper),
	.host :global(.milkdown .ProseMirror .milkdown-list-item-block .label-wrapper *),
	.host :global(.milkdown .ProseMirror li::marker) {
		color: var(--text);
		font-size: 1rem;
	}
	.host :global(.milkdown) {
		padding: 0;
		--crepe-color-background: var(--surface);
		--crepe-color-on-background: var(--text);
		--crepe-color-surface: var(--surface-2);
		--crepe-color-surface-low: var(--surface-2);
		--crepe-color-on-surface: var(--text);
		--crepe-color-on-surface-variant: var(--text-dim);
		--crepe-color-outline: var(--border);
		--crepe-color-primary: var(--accent);
		--crepe-color-secondary: var(--surface-2);
		--crepe-color-on-secondary: var(--text);
		--crepe-color-inverse: var(--text);
		--crepe-color-on-inverse: var(--surface);
		--crepe-color-inline-code: var(--accent);
		--crepe-color-error: var(--danger);
		--crepe-color-hover: var(--surface-2);
		--crepe-color-selected: var(--border);
		--crepe-color-inline-area: var(--border);
		--crepe-font-default: var(--font);
		--crepe-font-title: var(--font);
		--crepe-font-code: var(--mono);
	}
</style>
