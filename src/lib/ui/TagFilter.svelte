<script lang="ts">
	import { repoStore } from '$lib/store/repo.svelte';

	const MAX_COLLAPSED = 12;

	let showAll = $state(false);
	let tags = $derived(repoStore.allTags);
	let visible = $derived(showAll ? tags : tags.slice(0, MAX_COLLAPSED));

	function isSelected(key: string): boolean {
		return repoStore.selectedTags.some((tag) => tag.toLowerCase() === key);
	}
</script>

<div class="filters no-print">
	<label class="search">
		<span class="visually-hidden">Search recipes</span>
		<input
			type="search"
			placeholder="Search recipes…"
			bind:value={repoStore.query}
			autocomplete="off"
		/>
	</label>

	{#if repoStore.folders.length > 1}
		<label class="folder">
			<span class="visually-hidden">Filter by folder</span>
			<select bind:value={repoStore.selectedFolder}>
				<option value="">All folders</option>
				{#each repoStore.folders as folder (folder.path)}
					<option value={folder.path}>{folder.path} ({folder.count})</option>
				{/each}
			</select>
		</label>
	{/if}

	{#if tags.length > 0}
		<div class="tags">
			{#each visible as tag (tag.key)}
				<button
					type="button"
					class="tag selectable"
					class:selected={isSelected(tag.key)}
					aria-pressed={isSelected(tag.key)}
					onclick={() => repoStore.toggleTag(tag.label)}
				>
					{tag.label}
					<span class="count">{tag.count}</span>
				</button>
			{/each}

			{#if tags.length > MAX_COLLAPSED}
				<button type="button" class="link" onclick={() => (showAll = !showAll)}>
					{showAll ? 'Show fewer' : `+${tags.length - MAX_COLLAPSED} more`}
				</button>
			{/if}
		</div>
	{/if}

	{#if repoStore.isFiltering}
		<p class="status muted">
			{repoStore.filtered.length} of {repoStore.recipes.length} recipes
			<button type="button" class="link" onclick={() => repoStore.clearFilters()}>Clear</button>
		</p>
	{/if}
</div>

<style>
	.filters {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-bottom: 1rem;
	}

	.folder select,
	.search input {
		width: 100%;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.selectable {
		cursor: pointer;
		background: var(--surface-2);
		border: 1px solid var(--border);
		color: var(--text-dim);
		font: inherit;
		font-size: 0.78rem;
		padding: 0.12rem 0.55rem;
		border-radius: 999px;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		width: auto;
	}
	.selectable:hover {
		border-color: var(--accent);
	}
	.selectable.selected {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}

	.count {
		opacity: 0.7;
		font-variant-numeric: tabular-nums;
	}

	.status {
		font-size: 0.8rem;
		margin: 0;
	}
</style>
