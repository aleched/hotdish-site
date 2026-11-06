<script lang="ts">
	import Icon from '$lib/ui/Icon.svelte';
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		id?: string;
		values: string[];
		placeholder?: string;
		onchange: (values: string[]) => void;
	}

	let { id, values, placeholder = m.tag_add(), onchange }: Props = $props();

	let draft = $state('');

	function add() {
		const incoming = draft
			.split(/[,\n]/)
			.map((item) => item.trim())
			.filter(Boolean);
		draft = '';
		const next = [...values];
		for (const tag of incoming) {
			if (!next.some((item) => item.toLowerCase() === tag.toLowerCase())) next.push(tag);
		}
		if (next.length !== values.length) onchange(next);
	}

	function onpaste(event: ClipboardEvent) {
		const text = event.clipboardData?.getData('text') ?? '';
		if (!/[,\n]/.test(text)) return;
		event.preventDefault();
		const input = event.currentTarget as HTMLInputElement;
		const start = input.selectionStart ?? draft.length;
		const end = input.selectionEnd ?? draft.length;
		draft = draft.slice(0, start) + text + draft.slice(end);
		add();
	}

	function remove(tag: string) {
		onchange(values.filter((item) => item !== tag));
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			add();
		}
	}
</script>

<div class="tag-input">
	<input
		{id}
		type="text"
		class="draft"
		{placeholder}
		autocomplete="off"
		bind:value={draft}
		{onkeydown}
		{onpaste}
		onblur={add}
	/>
	{#each values as tag (tag)}
		<span class="tag chip">
			{tag}
			<button
				type="button"
				class="chip-x"
				title={m.tag_remove({ tag })}
				aria-label={m.tag_remove({ tag })}
				onclick={() => remove(tag)}
			>
				<Icon name="plus" size={10} />
			</button>
		</span>
	{/each}
</div>

<style>
	.tag-input {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}
	.draft {
		flex: 0 1 12rem;
		min-width: 8rem;
		width: auto;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		width: auto;
	}
	.chip-x {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		background: transparent;
		color: inherit;
		line-height: 0;
		opacity: 0.7;
	}
	.chip-x :global(svg) {
		transform: rotate(45deg);
	}
	.chip-x:hover:not(:disabled) {
		background: transparent;
		opacity: 1;
		color: var(--danger);
	}
</style>
