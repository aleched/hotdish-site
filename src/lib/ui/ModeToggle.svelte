<script lang="ts" generics="T extends string">
	import Icon from '$lib/ui/Icon.svelte';

	interface Item {
		value: T;
		label: string;
		icon: 'form' | 'markdown' | 'rich' | 'file';
	}

	interface Props {
		items: readonly Item[];
		value: T;
		label: string;
		onselect: (value: T) => void;
		/** Values that cannot be chosen, with the reason shown as a tooltip. */
		unavailable?: (value: T) => string | null;
	}

	let { items, value, label, onselect, unavailable }: Props = $props();

	let group: HTMLElement;

	function onKey(event: KeyboardEvent, index: number) {
		const step =
			event.key === 'ArrowRight' || event.key === 'ArrowDown'
				? 1
				: event.key === 'ArrowLeft' || event.key === 'ArrowUp'
					? -1
					: 0;
		if (!step) return;
		event.preventDefault();
		const next = (index + step + items.length) % items.length;
		if (unavailable?.(items[next].value)) return;
		onselect(items[next].value);
		requestAnimationFrame(() => group.querySelectorAll<HTMLElement>('button')[next]?.focus());
	}
</script>

<div
	bind:this={group}
	class="mode-toggle"
	role="radiogroup"
	aria-label={label}
	style:--n={items.length}
	style:--i={Math.max(0, items.findIndex((item) => item.value === value))}
>
	<span class="thumb" aria-hidden="true"></span>
	{#each items as item, index (item.value)}
		{@const reason = unavailable?.(item.value) ?? null}
		<button
			type="button"
			role="radio"
			aria-checked={value === item.value}
			aria-disabled={reason !== null}
			aria-label={item.label}
			title={reason ? `${item.label} is unavailable: ${reason}` : item.label}
			tabindex={value === item.value ? 0 : -1}
			class:on={value === item.value}
			class:unavailable={reason !== null}
			onclick={() => reason === null && onselect(item.value)}
			onkeydown={(event) => onKey(event, index)}
		>
			<Icon name={item.icon} size={17} />
		</button>
	{/each}
</div>

<style>
	.mode-toggle {
		position: relative;
		display: inline-grid;
		grid-template-columns: repeat(var(--n), 2.6rem);
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface-2);
		padding: 2px;
	}
	.thumb {
		position: absolute;
		top: 2px;
		bottom: 2px;
		left: 2px;
		width: 2.6rem;
		border-radius: 999px;
		background: var(--accent);
		transform: translateX(calc(var(--i) * 2.6rem));
		transition: transform 0.18s ease;
	}
	button {
		position: relative;
		width: 2.6rem;
		height: 1.9rem;
		padding: 0;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--text-dim);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	button:hover:not(:disabled) {
		background: transparent;
		border-color: transparent;
		color: var(--text);
	}
	button.on:hover:not(:disabled) {
		background: transparent;
		color: #fff;
	}
	button.on {
		color: #fff;
	}
	button.unavailable {
		opacity: 0.4;
		cursor: not-allowed;
	}
	button.unavailable:hover:not(:disabled) {
		color: var(--text-dim);
	}
	@media (prefers-reduced-motion: reduce) {
		.thumb {
			transition: none;
		}
	}
</style>
