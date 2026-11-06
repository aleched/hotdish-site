<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ForgeError, describeForgeError } from '#lib/forge/errors.ts';
	import { createProvider, TOKEN_GUIDANCE } from '#lib/forge/factory.ts';
	import { profileStore } from '#lib/store/profiles.svelte.ts';
	import { repoStore } from '#lib/store/repo.svelte.ts';
	import Icon from './Icon.svelte';
	import Modal from './Modal.svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		title: string;
		/** Prefilled commit message; the user can edit it before submitting. */
		message: string;
		busy?: boolean;
		error?: unknown;
		submitLabel?: string;
		submitIcon?: 'save' | 'trash';
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
		submitLabel = m.commit_submit(),
		submitIcon = 'save',
		danger = false,
		disabled = false,
		wide = false,
		autofocusMessage = true,
		onsubmit,
		oncancel,
		children,
		errorExtra
	}: Props = $props();

	let acceptedError = $state.raw<unknown>(null);
	// Once a token is saved the old auth error no longer applies; a new failure shows again.
	let visibleError = $derived(error && error !== acceptedError ? error : null);
	let described = $derived(visibleError ? describeForgeError(visibleError) : null);
	let authFailed = $derived(visibleError instanceof ForgeError && visibleError.kind === 'auth');
	let missingToken = $derived(!(repoStore.provider?.authenticated ?? true));
	let needsToken = $derived(missingToken || authFailed);
	// Without a token the prompt speaks for itself; only a rejected token needs the error text.
	let shownError = $derived(missingToken && authFailed ? null : described);
	let guidance = $derived(repoStore.ref ? TOKEN_GUIDANCE[repoStore.ref.kind] : m.home_token());
	let branch = $derived(repoStore.resolvedRef);

	let token = $state('');
	let checkingToken = $state(false);
	let tokenError = $state<string | null>(null);

	async function saveToken() {
		const value = token.trim();
		const ref = repoStore.ref ? $state.snapshot(repoStore.ref) : null;
		if (!ref || !value || checkingToken) return;

		checkingToken = true;
		tokenError = null;
		try {
			// Catch typos and expired tokens here rather than on the next save.
			await createProvider(ref, value).resolveDefaultBranch();
			repoStore.setToken(value);
			profileStore.saveTokenFor(ref, value);
			acceptedError = error;
			token = '';
		} catch (cause) {
			tokenError = describeForgeError(cause).message;
		} finally {
			checkingToken = false;
		}
	}

	function tokenKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		void saveToken();
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || disabled || missingToken || !message.trim()) return;
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
			<label class="visually-hidden" for="commit-message">{m.commit_message()}</label>
			<div class="message-row">
				<span class="message-icon" title={m.commit_message()}><Icon name="message" size={18} /></span>
				<input
					id="commit-message"
					type="text"
					bind:value={message}
					placeholder={m.commit_message()}
					autocomplete="off"
					use:focusAndSelect
				/>
			</div>
			{#if branch}
				<p class="muted small branch-note" title={m.commit_directly({ branch })}>
					<Icon name="branch" size={14} /><code>{branch}</code>
				</p>
			{/if}
		</div>

		{#if shownError || needsToken}
			<div class="banner error">
				{#if shownError}
					<p><strong>{shownError.message}</strong></p>
					{#if shownError.hint}<p>{shownError.hint}</p>{/if}
				{/if}
				{#if needsToken}
					<div class="token-row">
						<span class="token-icon" title={m.home_token()}><Icon name="key" size={18} /></span>
						<input
							type="password"
							bind:value={token}
							placeholder={guidance}
							aria-label={m.home_token()}
							autocomplete="off"
							spellcheck="false"
							disabled={checkingToken}
							onkeydown={tokenKeydown}
						/>
						<div class="split">
							<button
								type="button"
								class="part save"
								title={m.commit_save_token()}
								aria-label={m.commit_save_token()}
								disabled={checkingToken || !token.trim()}
								onclick={saveToken}
							>
								<Icon name={checkingToken ? 'spinner' : 'save'} />
							</button>
						</div>
					</div>
					{#if tokenError}<p class="token-error">{tokenError}</p>{/if}
				{/if}
				{#if errorExtra}{@render errorExtra()}{/if}
			</div>
		{/if}

		<div class="row actions">
			<div class="split">
				<button
					type="button"
					class="part"
					title={m.common_cancel()}
					aria-label={m.common_cancel()}
					disabled={busy}
					onclick={oncancel}
				>
					<Icon name="cancel" />
				</button>
				<button
					class="part save"
					class:danger-fill={danger}
					type="submit"
					title={submitLabel}
					aria-label={submitLabel}
					disabled={busy || disabled || missingToken || !message.trim()}
				>
					<Icon name={busy ? 'spinner' : submitIcon} />
				</button>
			</div>
		</div>
	</form>
</Modal>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.message-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.message-row input {
		flex: 1;
		min-width: 0;
	}
	.message-icon {
		display: inline-flex;
		color: var(--text-dim);
	}
	.branch-note {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
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
	.split {
		display: inline-flex;
	}
	.part {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 0.7rem;
		box-sizing: border-box;
		/* Same height as a text input: 1.6 line-height + 0.45rem padding twice + 1px border twice. */
		height: calc(1.6rem + 0.9rem + 2px);
		border: 1px solid var(--border);
		border-radius: 0;
		background: var(--surface);
		color: var(--text);
		line-height: 0;
		cursor: pointer;
	}
	.part:hover:not(:disabled) {
		border-color: var(--accent);
		position: relative;
	}
	.part.save:not(:disabled) {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.part.save.danger-fill:not(:disabled) {
		background: var(--danger);
		border-color: var(--danger);
	}
	.part:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.split > .part:first-child {
		border-radius: var(--radius-sm) 0 0 var(--radius-sm);
	}
	.split > .part:last-child {
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
	}
	.split > .part + .part {
		margin-left: -1px;
	}
	.split > .part:only-child {
		border-radius: var(--radius-sm);
	}
	.token-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}
	.token-row input {
		flex: 1;
		min-width: 0;
	}
	.token-icon {
		display: inline-flex;
		color: var(--text-dim);
	}
	.token-error {
		margin: 0.4rem 0 0;
		font-size: 0.85rem;
	}
</style>
