<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ForgeError, describeForgeError } from '$lib/forge/errors';
	import { authStore } from '$lib/store/auth.svelte';
	import { repoStore } from '$lib/store/repo.svelte';
	import Modal from './Modal.svelte';

	interface Props {
		title: string;
		/** Prefilled commit message; the user can edit it before submitting. */
		message: string;
		busy?: boolean;
		error?: unknown;
		submitLabel?: string;
		busyLabel?: string;
		danger?: boolean;
		/** Extra validation from the caller, e.g. an invalid destination. */
		disabled?: boolean;
		wide?: boolean;
		/** Focus the message field on open; otherwise the first field gets focus. */
		autofocusMessage?: boolean;
		onsubmit: () => void;
		oncancel: () => void;
		children?: Snippet;
		/** Rendered inside the error banner, e.g. a "reload" action for conflicts. */
		errorExtra?: Snippet;
	}

	let {
		title,
		message = $bindable(),
		busy = false,
		error = null,
		submitLabel = 'Submit',
		busyLabel = 'Submitting…',
		danger = false,
		disabled = false,
		wide = false,
		autofocusMessage = true,
		onsubmit,
		oncancel,
		children,
		errorExtra
	}: Props = $props();

	let described = $derived(error ? describeForgeError(error) : null);
	let authFailed = $derived(error instanceof ForgeError && error.kind === 'auth');
	let branch = $derived(repoStore.resolvedRef);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || disabled || !message.trim()) return;
		onsubmit();
	}

	function focusAndSelect(node: HTMLInputElement) {
		if (!autofocusMessage) return;
		requestAnimationFrame(() => {
			node.focus();
			node.select();
		});
	}
</script>

<Modal {title} {wide} dismissable={!busy} onclose={oncancel}>
	<form class="stack" onsubmit={submit}>
		{#if children}{@render children()}{/if}

		<div class="field">
			<label class="label" for="commit-message">Commit message</label>
			<input
				id="commit-message"
				type="text"
				bind:value={message}
				autocomplete="off"
				use:focusAndSelect
			/>
			{#if branch}
				<p class="muted small">Commits directly to <code>{branch}</code>.</p>
			{/if}
		</div>

		{#if described}
			<div class="banner error">
				<p><strong>{described.message}</strong></p>
				{#if described.hint}<p>{described.hint}</p>{/if}
				{#if authFailed}
					<button type="button" onclick={() => authStore.requireToken({ force: true })}>
						Update access token
					</button>
				{/if}
				{#if errorExtra}{@render errorExtra()}{/if}
			</div>
		{/if}

		<div class="row actions">
			<button type="button" disabled={busy} onclick={oncancel}>Cancel</button>
			<button
				class="primary"
				class:danger-fill={danger}
				type="submit"
				disabled={busy || disabled || !message.trim()}
			>
				{busy ? busyLabel : submitLabel}
			</button>
		</div>
	</form>
</Modal>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.label {
		font-size: 0.85rem;
		font-weight: 600;
	}
	.small {
		font-size: 0.78rem;
		margin: 0;
	}
	.banner p {
		margin: 0 0 0.4rem;
	}
	.actions {
		justify-content: flex-end;
	}
	button.primary.danger-fill {
		background: var(--danger);
		border-color: var(--danger);
	}
	button.primary.danger-fill:hover:not(:disabled) {
		filter: brightness(1.1);
		background: var(--danger);
		border-color: var(--danger);
	}
</style>
