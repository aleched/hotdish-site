<script lang="ts">
	import { docSearch } from '#lib/store/docSearch.svelte.ts';
	import { m } from '#lib/paraglide/messages.js';
</script>

{#if docSearch.total > 0}
	<div class="wrap no-print">
		<div class="nav" role="group" aria-label={m.match_nav()}>
			<button type="button" class="part" title={m.match_prev()} aria-label={m.match_prev()} onclick={() => docSearch.prev()}>
				<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5L5.5 8 10 12.5" /></svg>
			</button>
			<span class="part position" aria-live="polite">{docSearch.index + 1} / {docSearch.total}</span>
			<button type="button" class="part" title={m.match_next()} aria-label={m.match_next()} onclick={() => docSearch.next()}>
				<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5" /></svg>
			</button>
		</div>
	</div>
{/if}

<style>
	/* Zero height so it floats over the content without pushing it down; sticks below the app bar on scroll. */
	.wrap {
		position: sticky;
		top: calc(57px + 0.5rem);
		z-index: 5;
		height: 0;
		display: flex;
		justify-content: flex-end;
		pointer-events: none;
	}
	/* A split button: chevron, position (display only) and chevron share borders like one control. */
	.nav {
		display: inline-flex;
		align-self: flex-start;
		border-radius: var(--radius-sm);
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.2);
		pointer-events: auto;
	}
	.part {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		height: 2rem;
		margin: 0;
		padding: 0 0.6rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 0;
		color: var(--text);
		line-height: 0;
	}
	.part:first-child {
		border-radius: var(--radius-sm) 0 0 var(--radius-sm);
	}
	.part:last-child {
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
	}
	.part + .part {
		margin-left: -1px;
	}
	button.part:hover:not(:disabled) {
		position: relative;
		border-color: var(--accent);
	}
	.position {
		min-width: 3.6rem;
		padding: 0 0.5rem;
		font-size: 0.85rem;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		cursor: default;
	}
</style>
