<script lang="ts">
	import { page } from '$app/stores';
	import { repoStore } from '$lib/store/repo.svelte';

	let copied = $state(false);
	let failed = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	let shareUrl = $derived(`${$page.url.origin}${$page.url.pathname}`);
	let usesToken = $derived(repoStore.provider?.authenticated ?? false);

	async function copy() {
		failed = false;
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			clearTimeout(timer);
			timer = setTimeout(() => (copied = false), 2000);
		} catch {
			failed = true;
		}
	}
</script>

<div class="share no-print">
	<button type="button" onclick={copy} title={shareUrl}>
		{copied ? 'Link copied' : 'Share'}
	</button>

	{#if failed}
		<input class="fallback" type="text" readonly value={shareUrl} aria-label="Share link" />
	{/if}

	{#if usesToken}
		<p class="muted note">
			This link contains only the repository and path — never your token. Anyone you share it
			with will need their own access if the repository is private.
		</p>
	{/if}
</div>

<style>
	.share {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		align-items: flex-end;
	}
	.note {
		font-size: 0.75rem;
		max-width: 28ch;
		text-align: right;
		margin: 0;
	}
	.fallback {
		font-size: 0.8rem;
		font-family: var(--mono);
	}
</style>
