<script lang="ts">
	import { createProvider, FORGE_LABELS, TOKEN_GUIDANCE } from '$lib/forge/factory';
	import { describeForgeError } from '$lib/forge/errors';
	import { authStore } from '$lib/store/auth.svelte';
	import { repoStore } from '$lib/store/repo.svelte';
	import Modal from './Modal.svelte';

	let token = $state('');
	let checking = $state(false);
	let error = $state<{ message: string; hint?: string } | null>(null);

	let ref = $derived(repoStore.ref ? $state.snapshot(repoStore.ref) : null);

	async function save(event: SubmitEvent) {
		event.preventDefault();
		const value = token.trim();
		if (!ref || !value) return;

		checking = true;
		error = null;
		try {
			// Catch typos and expired tokens here rather than at commit time.
			await createProvider(ref, value).resolveDefaultBranch();
			authStore.accept(ref, value);
		} catch (cause) {
			error = describeForgeError(cause);
		} finally {
			checking = false;
		}
	}
</script>

<Modal title="Access token required" dismissable={!checking} onclose={() => authStore.cancel()}>
	<form class="stack" onsubmit={save}>
		{#if ref}
			<p class="intro">
				Changes are saved as commits to <strong>{ref.owner}/{ref.repo}</strong> on
				{FORGE_LABELS[ref.kind]}, which needs a personal access token with write access.
			</p>
			<p class="muted small">{TOKEN_GUIDANCE[ref.kind]}</p>
		{/if}

		<div class="field">
			<label class="label" for="token-input">Personal access token</label>
			<input
				id="token-input"
				type="password"
				bind:value={token}
				autocomplete="off"
				spellcheck="false"
			/>
			<p class="muted small">
				Stored only in this browser for this repository. You can remove it later from the
				repository list.
			</p>
		</div>

		{#if error}
			<div class="banner error">
				<p><strong>{error.message}</strong></p>
				{#if error.hint}<p>{error.hint}</p>{/if}
			</div>
		{/if}

		<div class="row actions">
			<button type="button" disabled={checking} onclick={() => authStore.cancel()}>Cancel</button>
			<button class="primary" type="submit" disabled={checking || !token.trim()}>
				{checking ? 'Checking…' : 'Save token'}
			</button>
		</div>
	</form>
</Modal>

<style>
	.intro {
		margin: 0;
	}
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
</style>
