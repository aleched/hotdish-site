<script lang="ts">
	import { FORGE_LABELS } from '$lib/forge/factory';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { rateLimitStore } from '$lib/store/rateLimit.svelte';
	import Modal from './Modal.svelte';
	import { m } from '$lib/paraglide/messages.js';

	let notice = $derived(rateLimitStore.notice);
</script>

{#if notice}
	<Modal title={m.rate_title()} onclose={() => rateLimitStore.dismiss()}>
		<div class="stack">
			<p class="intro">
				{m.rate_intro({ forge: FORGE_LABELS[notice.kind], host: notice.host })}
			</p>
			<p class="muted small">
				{#if notice.resetAt}
					{m.rate_resets({ time: notice.resetAt.toLocaleTimeString(getLocale()) })}
				{:else}
					{m.rate_wait()}
				{/if}
				{m.rate_token_hint()}
			</p>
			<div class="row actions">
				<button
					class="primary dialog-button"
					type="button"
					onclick={() => rateLimitStore.dismiss()}
				>
					{m.common_ok()}
				</button>
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
