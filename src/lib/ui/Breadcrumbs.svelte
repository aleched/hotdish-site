<script lang="ts">
	import Icon from '$lib/ui/Icon.svelte';
	import { m } from '$lib/paraglide/messages.js';

	interface Crumb {
		label: string;
		href: string;
	}

	interface Props {
		src: string;
		path: string;
		rootLabel: string;
		/** Shows a pencil that turns the part after the repository name into a text box. */
		renamable?: boolean;
		renaming?: boolean;
		/** Keeps the text box open without a pencil, for a recipe that has no path yet. */
		forceEdit?: boolean;
		/** The edited path, relative to the repository base path. */
		value?: string;
	}

	let {
		src,
		path,
		rootLabel,
		renamable = false,
		renaming = $bindable(false),
		forceEdit = false,
		value = $bindable('')
	}: Props = $props();

	let showInput = $derived(renamable && (renaming || forceEdit));
	// An edited path that is not saved yet stays visible while the text box is closed.
	let pending = $derived(renamable && !showInput && value !== '' && value !== path);

	let crumbs = $derived.by<Crumb[]>(() => {
		const segments = path.split('/').filter(Boolean);
		const result: Crumb[] = [{ label: rootLabel, href: `/r/${src}` }];
		let accumulated = '';
		for (const segment of segments) {
			accumulated = accumulated ? `${accumulated}/${segment}` : segment;
			result.push({ label: segment, href: `/r/${src}/${encodeURI(accumulated)}` });
		}
		return result;
	});

	function toggle() {
		renaming = !renaming;
	}
</script>

<nav aria-label={m.crumbs_label()}>
	<ol>
		{#each showInput || pending ? crumbs.slice(0, 1) : crumbs as crumb, index (crumb.href)}
			<li>
				{#if index === crumbs.length - 1 && !showInput && !pending}
					<span aria-current="page">{crumb.label}</span>
				{:else}
					<a href={crumb.href}>{crumb.label}</a>
					<span class="sep" aria-hidden="true">/</span>
				{/if}
			</li>
		{/each}
		{#if showInput}
			<li class="path-edit">
				<span class="mirror" aria-hidden="true">{value || ' '}</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="text"
					bind:value
					aria-label={m.crumbs_path_input()}
					title={m.crumbs_path_input()}
					autocomplete="off"
					spellcheck="false"
					autofocus
				/>
			</li>
		{:else if pending}
			<li><span aria-current="page" title={m.crumbs_unsaved()}>{value}</span></li>
		{/if}
		{#if renamable && !forceEdit}
			<li>
				<button
					type="button"
					class="icon-button pencil"
					class:active={renaming}
					title={renaming ? m.crumbs_done() : m.crumbs_rename()}
					aria-label={renaming ? m.crumbs_done() : m.crumbs_rename()}
					aria-pressed={renaming}
					onclick={toggle}
				>
					<Icon name="edit" size={14} />
				</button>
			</li>
		{/if}
	</ol>
</nav>

<style>
	ol {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem;
		margin: 0 0 0.5rem;
		padding: 0;
		font-size: 0.85rem;
		color: var(--text-dim);
	}
	li {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.sep {
		color: var(--border);
	}
	.path-edit {
		display: inline-grid;
		min-width: 3rem;
	}
	.path-edit .mirror,
	.path-edit input {
		grid-area: 1 / 1;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.15rem 0.4rem;
		border: 1px solid transparent;
		white-space: pre;
	}
	.path-edit input {
		border-color: var(--border);
	}
	.path-edit .mirror {
		visibility: hidden;
	}
	.path-edit input {
		/* Zero intrinsic width so only the hidden mirror text sizes the grid column. */
		width: 0;
		min-width: 100%;
		box-sizing: border-box;
	}
	.pencil {
		border: none;
		background: transparent;
		box-shadow: none;
		opacity: 0.6;
	}
	.pencil:hover,
	.pencil:focus-visible,
	.pencil.active {
		opacity: 1;
	}
	span[aria-current] {
		color: var(--text);
		font-weight: 600;
	}
</style>
