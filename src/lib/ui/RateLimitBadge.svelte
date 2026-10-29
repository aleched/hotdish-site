<script lang="ts">
	import { repoStore } from '$lib/store/repo.svelte';

	let info = $derived(repoStore.rateLimit);
	let remaining = $derived(info?.remaining ?? null);
	let low = $derived(remaining !== null && remaining <= 10);
	let authenticated = $derived(repoStore.provider?.authenticated ?? false);

	let title = $derived.by(() => {
		if (!info || remaining === null) return '';
		const base = `${remaining} API requests remaining${info.limit ? ` of ${info.limit}` : ''}.`;
		return info.resetAt ? `${base} Resets at ${info.resetAt.toLocaleTimeString()}.` : base;
	});
</script>

{#if info && remaining !== null}
	<span class="badge" class:low {title}>
		{remaining}{info.limit ? `/${info.limit}` : ''} left
		{#if low && !authenticated}
			<a href="/">add a token</a>
		{/if}
	</span>
{/if}

<style>
	.badge {
		font-size: 0.75rem;
		color: var(--text-dim);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0.1rem 0.55rem;
		white-space: nowrap;
	}
	.badge.low {
		color: var(--warn);
		border-color: var(--warn);
	}
	.badge a {
		margin-left: 0.3rem;
	}

	@media (max-width: 640px) {
		.badge {
			display: none;
		}
	}
</style>
