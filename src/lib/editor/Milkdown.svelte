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

	export function getMarkdown(): string | null {
		try {
			return crepe ? crepe.getMarkdown() : null;
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
					listener.markdownUpdated(() => onchange?.(instance.getMarkdown()));
				});
			} catch {
				// Change notifications are an optimisation; markdown is read again at save time.
			}

			await instance.create();
			crepe = instance;
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
	}
</style>
