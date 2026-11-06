<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { toRelative } from '$lib/paths';
	import { repoStore } from '$lib/store/repo.svelte';
	import { editorPrefs } from '$lib/store/editorPrefs.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import { m } from '$lib/paraglide/messages.js';

	const MAX_COLLAPSED = 12;
	const popoverId = 'filter-popover';

	let showAll = $state(false);
	let open = $state(false);
	let folderQuery = $state('');
	let root: HTMLDivElement | undefined = $state();

	let canRandom = $derived(repoStore.filtered.length > 0 && Boolean($page.params.src));

	/** Opens a random document from the current (filtered) list, avoiding the one already open. */
	function randomDoc() {
		const current = decodeURI($page.params.path ?? '');
		const pool = repoStore.filtered
			.map((doc) => toRelative(doc.path, repoStore.basePath))
			.filter((path) => path !== current);
		if (pool.length === 0) return;
		const pick = pool[Math.floor(Math.random() * pool.length)];
		void goto(`/r/${$page.params.src}/${encodeURI(pick)}`);
	}
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
			<span class="visually-hidden">{m.filter_search()}</span>
			<Icon name="search" />
			<input
				type="search"
				aria-label={m.filter_search()}
				title={m.filter_search()}
				bind:value={repoStore.query}
				autocomplete="off"
			/>
		</label>
		<button
			type="button"
			class="filter-button"
			class:active={activeCount > 0 || open}
			aria-label={activeCount > 0 ? m.filter_button_active({ count: activeCount }) : m.filter_button()}
			title={m.filter_by()}
			aria-expanded={open}
			aria-controls={popoverId}
			onclick={() => (open = !open)}
		>
			<Icon name="filter" />
			{#if activeCount > 0}<span class="badge">{activeCount}</span>{/if}
		</button>
		{#if editorPrefs.randomButton}
			<button
				type="button"
				class="filter-button"
				aria-label={m.filter_random()}
				title={m.filter_random()}
				disabled={!canRandom}
				onclick={randomDoc}
			>
				<Icon name="dice" />
			</button>
		{/if}
	</div>

	{#if open}
		<div class="popover" id={popoverId}>
			<section>
				<h3 title={m.filter_folders()}><Icon name="folder" /><span class="visually-hidden">{m.filter_folders()}</span></h3>
				{#if repoStore.folders.length === 0}
					<p class="muted small" title={m.filter_no_folders()} aria-label={m.filter_no_folders()}><Icon name="folder" size={18} /></p>
				{:else}
					{#if repoStore.folders.length > 8}
						<input
							type="search"
							class="folder-search"
							placeholder={m.filter_find_folder_placeholder()}
							aria-label={m.filter_find_folder()}
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
							<li class="muted small" title={m.filter_no_matching_folders()} aria-label={m.filter_no_matching_folders()}><Icon name="search" size={18} /></li>
						{/each}
					</ul>
				{/if}
			</section>

			{#if tags.length > 0}
				<section>
					<h3 title={m.filter_tags()}><Icon name="tag" /><span class="visually-hidden">{m.filter_tags()}</span></h3>
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
							<button
								type="button"
								class="link more-tags"
								title={showAll ? m.filter_fewer_tags() : m.filter_more_tags({ count: tags.length - MAX_COLLAPSED })}
								aria-label={showAll ? m.filter_fewer_tags() : m.filter_more_tags({ count: tags.length - MAX_COLLAPSED })}
								aria-expanded={showAll}
								onclick={() => (showAll = !showAll)}
							>
								<Icon name={showAll ? 'collapse' : 'expand'} size={14} />
								{#if !showAll}{tags.length - MAX_COLLAPSED}{/if}
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
				aria-label={m.filter_clear_all()}
				title={m.filter_clear_all()}
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
					aria-label={m.filter_remove_folder({ path })}
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
					aria-label={m.filter_remove_tag({ tag })}
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
			{m.filter_status({ shown: repoStore.filtered.length, total: repoStore.docs.length })}
		</p>
	{/if}
</div>

<style>
	.more-tags {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
	}
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
