<script lang="ts">
	import { folderError, normalizeFolder } from '$lib/paths';
	import { repoStore } from '$lib/store/repo.svelte';

	interface Props {
		/** Folder relative to the repository base path; empty means the top level. */
		value: string;
		id?: string;
		label?: string;
	}

	let { value = $bindable(), id = 'folder-picker', label = 'Folder' }: Props = $props();

	const listId = `${id}-options`;

	let normalized = $derived(normalizeFolder(value));
	let invalid = $derived(folderError(value));
	let isNew = $derived(
		normalized !== '' && !repoStore.folders.some((folder) => folder.path === normalized)
	);
</script>

<div class="field">
	<label class="label" for={id}>{label}</label>
	<input
		{id}
		type="text"
		list={listId}
		bind:value
		placeholder="(top level)"
		autocomplete="off"
		spellcheck="false"
	/>
	<datalist id={listId}>
		{#each repoStore.folders as folder (folder.path)}
			<option value={folder.path}></option>
		{/each}
	</datalist>
	{#if invalid}
		<p class="small error">{invalid}</p>
	{:else if isNew}
		<p class="muted small">New folder <code>{normalized}</code> will be created.</p>
	{:else}
		<p class="muted small">Pick an existing folder or type a new path, e.g. <code>dinner/pasta</code>.</p>
	{/if}
</div>

<style>
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
	.error {
		color: var(--danger);
	}
</style>
