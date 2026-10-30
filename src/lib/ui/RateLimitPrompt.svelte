<script lang="ts">
	import { FORGE_LABELS } from '$lib/forge/factory';
	import { rateLimitStore } from '$lib/store/rateLimit.svelte';
	import Modal from './Modal.svelte';

	let notice = $derived(rateLimitStore.notice);
</script>

{#if notice}
	<Modal title="Rate limit reached" onclose={() => rateLimitStore.dismiss()}>
		<div class="stack">
			<p class="intro">
				{FORGE_LABELS[notice.kind]} ({notice.host}) is rejecting requests because the API rate limit
				was exceeded.
			</p>
			<p class="muted small">
				{#if notice.resetAt}
					The limit resets at {notice.resetAt.toLocaleTimeString()}.
				{:else}
					Wait a few minutes before trying again.
				{/if}
				Adding a personal access token to this repository raises the limit.
			</p>
			<div class="row actions">
				<button class="primary" type="button" onclick={() => rateLimitStore.dismiss()}>OK</button>
			</div>
		</div>
	</Modal>
{/if}

<style>
	.intro {
		margin: 0;
	}
	.small {
		font-size: 0.78rem;
		margin: 0;
	}
	.actions {
		justify-content: flex-end;
	}
</style>
