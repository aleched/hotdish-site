<script lang="ts">
	import { repoStore } from '$lib/store/repo.svelte';
	import Icon from '$lib/ui/Icon.svelte';

	const MAX_COLLAPSED = 12;
	const popoverId = 'filter-popover';

	let showAll = $state(false);
	let open = $state(false);
	let folderQuery = $state('');
	let root: HTMLDivElement | undefined = $state();

	let tags = $derived(repoStore.allTags);
	let visible = $derived(showAll ? tags : tags.slice(0, MAX_COLLAPSED));
	let folders = $derived.by(() => {
		const needle = folderQuery.trim().toLowerCase();
		return needle
			? repoStore.folders.filter((folder) => folder.path.toLowerCase().includes(needle))
			: repoStore.folders;
	});
	let activeCount = $derived(repoStore.selectedTags.length + repoStore.selectedFolders.length);

	function isSelected(key: string): boolean {
		return repoStore.selectedTags.some((tag) => tag.toLowerCase() === key);
	}

	function onwindowclick(event: MouseEvent) {
		if (open && root && !root.contains(event.target as Node)) open = false;
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			open = false;
			event.stopPropagation();
		}
	}
</script>

<svelte:window onclick={onwindowclick} />

<div class="filters no-print" bind:this={root} {onkeydown} role="presentation">
	<div class="row">
		<label class="search">
			<span class="visually-hidden">Search recipes</span>
			<Icon name="search" />
			<input
				type="search"
				aria-label="Search recipes"
				title="Search recipes"
				bind:value={repoStore.query}
				autocomplete="off"
			/>
		</label>
		<button
			type="button"
			class="filter-button"
			class:active={activeCount > 0 || open}
			aria-label={activeCount > 0 ? `Filters (${activeCount} active)` : 'Filters'}
			title="Filter by folder or tag"
			aria-expanded={open}
			aria-controls={popoverId}
			onclick={() => (open = !open)}
		>
			<Icon name="filter" />
			{#if activeCount > 0}<span class="badge">{activeCount}</span>{/if}
		</button>
	</div>

	{#if open}
		<div class="popover" id={popoverId}>
			<section>
				<h3 title="Folders"><Icon name="folder" /><span class="visually-hidden">Folders</span></h3>
				{#if repoStore.folders.length === 0}
					<p class="muted small">No folders.</p>
				{:else}
					{#if repoStore.folders.length > 8}
						<input
							type="search"
							class="folder-search"
							placeholder="Find a folder…"
							aria-label="Find a folder"
							bind:value={folderQuery}
							autocomplete="off"
						/>
					{/if}
					<ul class="folder-list">
						{#each folders as folder (folder.path)}
							<li>
								<label>
									<input
										type="checkbox"
										checked={repoStore.selectedFolders.includes(folder.path)}
										onchange={() => repoStore.toggleFolder(folder.path)}
									/>
									<span class="path">{folder.path}</span>
									<span class="count">{folder.count}</span>
								</label>
							</li>
						{:else}
							<li class="muted small">No matching folders.</li>
						{/each}
					</ul>
				{/if}
			</section>

			{#if tags.length > 0}
				<section>
					<h3 title="Tags"><Icon name="tag" /><span class="visually-hidden">Tags</span></h3>
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
				</section>
			{/if}
		</div>
	{/if}

	{#if activeCount > 0}
		<div class="tags active-chips">
			<button
				type="button"
				class="tag selectable clear-chip"
				aria-label="Clear all filters"
				title="Clear all filters"
				onclick={() => repoStore.clearFilters()}
			>
				<span class="clear-x" aria-hidden="true">
					<svg viewBox="0 0 10 10" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
						<path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
					</svg>
				</span>
			</button>
			{#each repoStore.selectedFolders as path (path)}
				<button
					type="button"
					class="tag selectable selected"
					aria-label={`Remove folder filter ${path}`}
					onclick={() => repoStore.toggleFolder(path)}
				>
					<Icon name="folder" size={12} />
					{path}
					<span aria-hidden="true">×</span>
				</button>
			{/each}
			{#each repoStore.selectedTags as tag (tag)}
				<button
					type="button"
					class="tag selectable selected"
					aria-label={`Remove tag filter ${tag}`}
					onclick={() => repoStore.toggleTag(tag)}
				>
					{tag}
					<span aria-hidden="true">×</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if repoStore.isFiltering}
		<p class="status muted">
			{repoStore.filtered.length} of {repoStore.recipes.length} recipes
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

	.row {
		display: flex;
		gap: 0.4rem;
		align-items: stretch;
	}

	.search {
		flex: 1;
		min-width: 0;
		position: relative;
		display: block;
	}
	.search :global(svg) {
		position: absolute;
		left: 0.6rem;
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-dim);
		pointer-events: none;
	}
	.search input {
		width: 100%;
		padding-left: 2rem;
	}

	.filter-button {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.3rem;
		flex: none;
		padding: 0;
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text-dim);
		border-radius: 8px;
		cursor: pointer;
	}
	.filter-button:hover,
	.filter-button.active {
		border-color: var(--accent);
		color: var(--accent);
	}
	/* Kept inside the button so it is never clipped by the sidebar's scroll area. */
	.badge {
		position: absolute;
		top: 0.1rem;
		right: 0.1rem;
		min-width: 1rem;
		height: 1rem;
		padding: 0 0.2rem;
		box-sizing: border-box;
		border-radius: 999px;
		background: var(--accent);
		color: #fff;
		font-size: 0.65rem;
		line-height: 1rem;
		text-align: center;
	}

	.popover {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		padding: 0.8rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
		max-height: 70vh;
		overflow-y: auto;
	}
	h3 {
		margin: 0 0 0.4rem;
		display: flex;
		color: var(--text-dim);
	}
	.small {
		font-size: 0.8rem;
		margin: 0;
	}

	.folder-search {
		width: 100%;
		margin-bottom: 0.4rem;
	}
	.folder-list {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 12rem;
		overflow-y: auto;
	}
	.folder-list label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.2rem 0.3rem;
		border-radius: 6px;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.folder-list label:hover {
		background: var(--surface-2);
	}
	.folder-list input {
		width: auto;
		margin: 0;
	}
	.path {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
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
	.selectable.clear-chip {
		background: transparent;
		border-color: var(--danger);
		color: var(--danger);
		line-height: 1.2;
	}
	.selectable.clear-chip .clear-x {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.2em;
		height: 1.2em;
	}
	.selectable.clear-chip:hover {
		background: var(--danger);
		color: #fff;
	}

	.count {
		opacity: 0.7;
		font-variant-numeric: tabular-nums;
		font-size: 0.78rem;
	}

	.status {
		font-size: 0.8rem;
		margin: 0;
	}
</style>
