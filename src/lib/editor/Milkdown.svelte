<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import '@milkdown/crepe/theme/common/style.css';
	import '@milkdown/crepe/theme/frame.css';

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

	onMount(async () => {
		if (!container) return;
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
	<p class="muted">Starting editor…</p>
{/if}

<style>
	.host {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		min-height: 320px;
	}
	.host :global(.milkdown) {
		padding: 0.5rem;
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
		--crepe-font-code: var(--mono);
	}
</style>
