<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		onclose: () => void;
		/** When false, Escape is ignored (e.g. while a request is in flight). */
		dismissable?: boolean;
		wide?: boolean;
		children: Snippet;
	}

	let { title, onclose, dismissable = true, wide = false, children }: Props = $props();

	let dialog: HTMLDialogElement;
	const headingId = `modal-${Math.random().toString(36).slice(2)}`;

	// Native modal dialogs give focus trapping, Escape handling and inertness of the page for free.
	$effect(() => {
		dialog.showModal();
		return () => dialog.close();
	});

	function onCancel(event: Event) {
		event.preventDefault();
		if (dismissable) onclose();
	}
</script>

<dialog bind:this={dialog} class:wide aria-labelledby={headingId} oncancel={onCancel}>
	<div class="body stack">
		<h2 id={headingId}>{title}</h2>
		{@render children()}
	</div>
</dialog>

<style>
	dialog {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow);
		padding: 0;
		width: min(480px, calc(100vw - 2rem));
		max-height: calc(100vh - 2rem);
	}
	dialog.wide {
		width: min(760px, calc(100vw - 2rem));
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.45);
	}
	.body {
		padding: 1.1rem;
	}
	h2 {
		font-size: 1.05rem;
		margin: 0;
	}
</style>
