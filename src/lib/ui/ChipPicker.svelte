<script lang="ts">
	import { tick, untrack } from 'svelte';
	import Icon from '#lib/ui/Icon.svelte';

	interface Props {
		id?: string;
		values: string[];
		options?: string[];
		allowCustom?: boolean;
		addLabel: string;
		onchange: (values: string[]) => void;
	}

	let { id, values, options = [], allowCustom = true, addLabel, onchange }: Props = $props();

	// Anything selected or added while the picker is open stays listed until it is closed.
	let seen = $state<string[]>(untrack(() => [...values]));
	let adding = $state(false);
	let draft = $state('');
	let input = $state<HTMLInputElement>();

	let selected = $derived(new Set(values.map((value) => value.toLowerCase())));

	let chips = $derived.by(() => {
		const byKey = new Map<string, string>();
		for (const value of [...values, ...seen, ...options]) {
			const label = value.trim();
			const key = label.toLowerCase();
			if (label && !byKey.has(key)) byKey.set(key, label);
		}
		return [...byKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
	});

	function remember(tag: string) {
		if (!seen.some((item) => item.toLowerCase() === tag.toLowerCase())) seen.push(tag);
	}

	function toggle(tag: string) {
		if (adding) close();
		const key = tag.toLowerCase();
		if (selected.has(key)) {
			onchange(values.filter((item) => item.toLowerCase() !== key));
		} else {
			remember(tag);
			onchange([...values, tag]);
		}
	}

	function commit() {
		const incoming = draft
			.split(/[,\n]/)
			.map((item) => item.trim())
			.filter(Boolean);
		draft = '';
		const next = [...values];
		for (const tag of incoming) {
			remember(tag);
			if (!next.some((item) => item.toLowerCase() === tag.toLowerCase())) next.push(tag);
		}
		if (next.length !== values.length) onchange(next);
	}

	async function open() {
		adding = true;
		await tick();
		input?.focus();
	}

	function close() {
		commit();
		adding = false;
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			commit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			draft = '';
			adding = false;
		}
	}

	function onpaste(event: ClipboardEvent) {
		const text = event.clipboardData?.getData('text') ?? '';
		if (!/[,\n]/.test(text)) return;
		event.preventDefault();
		const target = event.currentTarget as HTMLInputElement;
		const start = target.selectionStart ?? draft.length;
		const end = target.selectionEnd ?? draft.length;
		draft = draft.slice(0, start) + text + draft.slice(end);
		commit();
	}
</script>

<div class="chips" {id} role="group" aria-label={addLabel}>
	{#if allowCustom}
		{#if adding}
			<span class="chip add-chip open">
				<span class="add-icon" aria-hidden="true"><Icon name="plus" size={11} /></span>
				<span class="grow" data-value={draft}>
					<input
						bind:this={input}
						bind:value={draft}
						type="text"
						size="1"
						autocomplete="off"
						aria-label={addLabel}
						{onkeydown}
						{onpaste}
						onblur={close}
					/>
				</span>
			</span>
		{:else}
			<button
				type="button"
				class="chip add-chip"
				title={addLabel}
				aria-label={addLabel}
				onclick={open}
			>
				<span class="add-icon" aria-hidden="true"><Icon name="plus" size={11} /></span>
			</button>
		{/if}
	{/if}
	{#each chips as chip (chip.toLowerCase())}
		<button
			type="button"
			class="chip"
			class:selected={selected.has(chip.toLowerCase())}
			aria-pressed={selected.has(chip.toLowerCase())}
			onmousedown={(event) => {
				// Keep focus in the open input so it doesn't collapse and shift the chips mid-click.
				if (adding) event.preventDefault();
			}}
			onclick={() => toggle(chip)}
		>
			{chip}
		</button>
	{/each}
</div>

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem;
	}
	.chip {
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		width: auto;
		margin: 0;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--text-dim);
		font: inherit;
		font-size: 0.78rem;
		line-height: 1.2;
		padding: 0.12rem 0.55rem;
		white-space: nowrap;
	}
	.chip:hover {
		border-color: var(--accent);
	}
	.chip.selected {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.add-chip {
		background: transparent;
		border-color: var(--ok);
		color: var(--ok);
	}
	.add-chip:hover {
		border-color: var(--ok);
	}
	button.add-chip:hover {
		background: var(--ok);
		color: #fff;
	}
	.add-chip.open {
		cursor: text;
		padding-right: 0.7rem;
	}
	.add-chip.open:focus-within {
		outline: 2px solid var(--ok);
		outline-offset: 1px;
	}
	.add-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.2em;
		height: 1.2em;
	}
	/* The hidden copy of the text sizes the grid cell, and the input fills it. */
	.grow {
		display: inline-grid;
		min-width: 5ch;
	}
	.grow::after {
		content: attr(data-value) ' ';
		grid-area: 1 / 1;
		visibility: hidden;
		white-space: pre;
		font: inherit;
	}
	.grow input {
		grid-area: 1 / 1;
		width: 100%;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: none;
		border-radius: 0;
		outline: none;
		background: transparent;
		box-shadow: none;
		color: var(--text);
		font: inherit;
		line-height: inherit;
	}
</style>
