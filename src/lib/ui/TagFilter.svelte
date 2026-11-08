<script lang="ts">
	import { repoStore } from '#lib/store/repo.svelte.ts';
	import { docSearch } from '#lib/store/docSearch.svelte.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import type { IconName } from '#lib/ui/icon-names.ts';
	import { m } from '#lib/paraglide/messages.js';

	const MAX_COLLAPSED = 12;
	const popoverId = 'filter-popover';

	let showAllFolders = $state(false);
	let showAllTags = $state(false);
	let open = $state(false);
	let folderQuery = $state('');
	let tagQuery = $state('');
	let root: HTMLDivElement | undefined = $state();

	let tags = $derived.by(() => {
		const needle = tagQuery.trim().toLowerCase();
		return needle
			? repoStore.allTags.filter((tag) => tag.label.toLowerCase().includes(needle))
			: repoStore.allTags;
	});
	let folders = $derived.by(() => {
		const needle = folderQuery.trim().toLowerCase();
		return needle
			? repoStore.folders.filter((folder) => folder.path.toLowerCase().includes(needle))
			: repoStore.folders;
	});
	let visibleTags = $derived(showAllTags ? tags : tags.slice(0, MAX_COLLAPSED));
	let visibleFolders = $derived(showAllFolders ? folders : folders.slice(0, MAX_COLLAPSED));
	let activeCount = $derived(repoStore.selectedTags.length + repoStore.selectedFolders.length);

	// Closing the popover brings back the collapsed lists.
	$effect(() => {
		if (!open) {
			showAllFolders = false;
			showAllTags = false;
		}
	});

	/** With a document open, Enter and Shift+Enter step through the matches in it. */
	function onSearchKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || docSearch.total === 0) return;
		event.preventDefault();
		if (event.shiftKey) docSearch.prev();
		else docSearch.next();
	}

	function isSelected(key: string): boolean {
		return repoStore.selectedTags.some((tag) => tag.toLowerCase() === key);
	}

	function onwindowclick(event: MouseEvent) {
		// The path is read from the event because a clicked button may already be gone from the DOM.
		if (open && root && !event.composedPath().includes(root)) open = false;
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			open = false;
			event.stopPropagation();
		}
	}
</script>

<svelte:window onclick={onwindowclick}></svelte:window>

{#snippet toggle(onclick: () => void)}
	<button
		type="button"
		class="icon-button expand-toggle"
		title={m.filter_show_all()}
		aria-label={m.filter_show_all()}
		onclick={onclick}
	><Icon name="expand" size={14} /></button>
{/snippet}

{#snippet option(icon: IconName, label: string, pressed: boolean, disabled: boolean, onclick: () => void)}
	<button
		type="button"
		class="option"
		class:on={pressed}
		title={label}
		aria-label={label}
		aria-pressed={pressed}
		{disabled}
		{onclick}
	><Icon name={icon} /></button>
{/snippet}

<div
	class="filters no-print"
	bind:this={root}
	onkeydown={onkeydown}
	role="presentation"
>
	<div class="row">
		<label class="search">
			<span class="visually-hidden">{m.filter_search()}</span>
			<Icon name="search" />
			<input
				type="search"
				aria-label={m.filter_search()}
				title={m.filter_search()}
				bind:value={repoStore.query}
				onkeydown={onSearchKeydown}
				autocomplete="off"
			/>
			<span class="options">
				{@render option('match-case', m.filter_match_case(), repoStore.matchCase, false, () => repoStore.matchCase = !repoStore.matchCase)}
				{@render option('whole-word', m.filter_whole_word(), repoStore.wholeWord, false, () => repoStore.wholeWord = !repoStore.wholeWord)}
				<span class="divider" aria-hidden="true"></span>
				{@render option('doc-search', m.filter_fulltext(), repoStore.fullText, false, () => repoStore.fullText = !repoStore.fullText)}
			</span>
		</label>
		<button
			type="button"
			class="filter-button"
			class:active={activeCount > 0 || open}
			aria-label={activeCount > 0 ? m.filter_button_active({ count: activeCount }) : m.filter_button()}
			title={m.filter_by()}
			aria-expanded={open}
			aria-controls={popoverId}
			onclick={() => open = !open}
		>
			<Icon name="filter" />
			{#if activeCount > 0}<span class="badge">{activeCount}</span>{/if}
		</button>
	</div>

	{#if open}
		<div class="popover" id={popoverId}>
			<section>
				<div class="section-head">
					<h3 title={m.filter_folders()}><Icon name="folder" /><span class="visually-hidden">{m.filter_folders()}</span></h3>
					{#if repoStore.folders.length > 0}
						<input
							type="search"
							class="section-search"
							placeholder={m.filter_find_folder_placeholder()}
							aria-label={m.filter_find_folder()}
							bind:value={folderQuery}
							autocomplete="off"
						/>
					{/if}
				</div>
				{#if repoStore.folders.length === 0}
					<p class="muted small" title={m.filter_no_folders()} aria-label={m.filter_no_folders()}><Icon name="folder" size={18} /></p>
				{:else}
					<div class="tags">
						{#each visibleFolders as folder (folder.path)}
							<button
								type="button"
								class="tag selectable"
								class:selected={repoStore.selectedFolders.includes(folder.path)}
								aria-pressed={repoStore.selectedFolders.includes(folder.path)}
								onclick={() => repoStore.toggleFolder(folder.path)}
							>
								<span class="path">{folder.path}</span>
								<span class="count">{folder.count}</span>
							</button>
						{:else}
							<p class="muted small" title={m.filter_no_matching_folders()} aria-label={m.filter_no_matching_folders()}><Icon name="search" size={18} /></p>
						{/each}
					</div>
					{#if folders.length > MAX_COLLAPSED && !showAllFolders}
						{@render toggle(() => showAllFolders = true)}
					{/if}
				{/if}
			</section>

			{#if repoStore.allTags.length > 0}
				<section>
					<div class="section-head">
						<h3 title={m.filter_tags()}><Icon name="tag" /><span class="visually-hidden">{m.filter_tags()}</span></h3>
						<input
							type="search"
							class="section-search"
							placeholder={m.filter_find_tag_placeholder()}
							aria-label={m.filter_find_tag()}
							bind:value={tagQuery}
							autocomplete="off"
						/>
					</div>
					<div class="tags">
						{#each visibleTags as tag (tag.key)}
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
						{:else}
							<p class="muted small" title={m.filter_no_matching_tags()} aria-label={m.filter_no_matching_tags()}><Icon name="search" size={18} /></p>
						{/each}
					</div>
					{#if tags.length > MAX_COLLAPSED && !showAllTags}
						{@render toggle(() => showAllTags = true)}
					{/if}
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
					<svg
						viewBox="0 0 10 10"
						width="11"
						height="11"
						fill="none"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linecap="round"
					><path d="M1.5 1.5l7 7M8.5 1.5l-7 7"></path></svg>
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
					<Icon name="tag" size={12} />
					{tag}
					<span aria-hidden="true">×</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if repoStore.isFiltering}
		<p class="status muted">
			{repoStore.filtered.length} / {repoStore.docs.length}
		</p>
	{/if}
</div>

<style>
	.expand-toggle {
		display: flex;
		margin: 0.4rem auto 0;
		padding: 0.2rem 0.5rem;
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
	.search > :global(svg) {
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
		padding-right: 5.6rem;
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
	/* Full-text search toggles, inside the right edge of the search box. */
	.options {
		position: absolute;
		right: 0.25rem;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		gap: 0.1rem;
	}
	.divider {
		align-self: center;
		width: 1px;
		height: 1rem;
		margin: 0 0.15rem;
		background: var(--border, currentColor);
		opacity: 0.5;
	}
	.option {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.6rem;
		height: 1.6rem;
		padding: 0;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		color: var(--text-dim);
		cursor: pointer;
	}
	.option :global(svg) {
		position: static;
		transform: none;
		width: 1rem;
		height: 1rem;
	}
	.option:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.option.on {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.option.on:hover:not(:disabled) {
		color: #fff;
	}
	.section-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.4rem;
	}
	h3 {
		margin: 0;
		display: flex;
		color: var(--text-dim);
	}
	.small {
		font-size: 0.8rem;
		margin: 0;
	}

	.section-search {
		flex: 1;
		min-width: 0;
		font-size: 0.78rem;
		padding: 0.2rem 0.5rem;
	}
	.path {
		min-width: 0;
		overflow-wrap: anywhere;
		white-space: normal;
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
