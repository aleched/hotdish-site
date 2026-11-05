<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { decodeSrc } from '$lib/share/codec';
	import type { RepoRef } from '$lib/forge/types';
	import type { RecipeDoc } from '$lib/markdown/recipe';
	import { repoStore } from '$lib/store/repo.svelte';
	import { profileStore } from '$lib/store/profiles.svelte';
	import { navStore } from '$lib/store/nav.svelte';
	import { historyStore } from '$lib/store/history.svelte';
	import Breadcrumbs from '$lib/ui/Breadcrumbs.svelte';
	import FolderTree from '$lib/ui/FolderTree.svelte';
	import RecipeView from '$lib/ui/RecipeView.svelte';
	import ShareButton from '$lib/ui/ShareButton.svelte';
	import TagFilter from '$lib/ui/TagFilter.svelte';
	import { findFolder, type TreeFolder } from '$lib/tree';
	import { FORGE_LABELS } from '$lib/forge/factory';
	import { untrack } from 'svelte';
	import { joinPath, parentFolder, toFull } from '$lib/paths';
	import { parseRecipe } from '$lib/markdown/recipe';
	import { scaffoldRecipe } from '$lib/editor/scaffold';
	import Icon from '$lib/ui/Icon.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import Loading from '$lib/ui/Loading.svelte';
	import DeleteRecipe from '$lib/editor/DeleteRecipe.svelte';

	let src = $derived($page.params.src ?? '');

	/** Surfaces a stalled dynamic import (blocked chunk, CSP) instead of spinning forever. */
	function loadWithTimeout<T>(loader: () => Promise<T>, ms = 15000): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error('Timed out loading the editor. Check the browser console.')),
				ms
			);
			loader().then(
				(value) => {
					clearTimeout(timer);
					resolve(value);
				},
				(cause) => {
					clearTimeout(timer);
					console.error('Editor failed to load', cause);
					reject(cause);
				}
			);
		});
	}
	let path = $derived(($page.params.path ?? '').replace(/^\/+|\/+$/g, ''));
	let editing = $derived($page.url.searchParams.has('edit'));

	let decoded = $derived.by<{ ref: RepoRef | null; error: string | null }>(() => {
		try {
			return { ref: decodeSrc(src), error: null };
		} catch (error) {
			return { ref: null, error: error instanceof Error ? error.message : String(error) };
		}
	});

	$effect(() => {
		const ref = decoded.ref;
		if (!ref) return;
		void repoStore.load(ref, profileStore.tokenFor(ref));
	});

	let fullPath = $derived(
		repoStore.basePath && path ? `${repoStore.basePath.replace(/\/+$/, '')}/${path}` : path
	);
	let entry = $derived(fullPath ? repoStore.entryFor(fullPath) : undefined);
	let folder = $derived(entry ? null : findFolder(repoStore.tree, path));

	let sourceLink = $derived.by(() => {
		const provider = repoStore.provider;
		const gitRef = repoStore.resolvedRef;
		if (!provider || !gitRef) return null;
		if (!entry && !folder) return null;
		return {
			href: provider.webUrl(entry ? entry.path : fullPath, gitRef, !entry),
			label: FORGE_LABELS[provider.kind],
			kind: provider.kind
		};
	});

	// Collapse the mobile menu after navigating to another recipe.
	$effect(() => {
		void path;
		navStore.open = false;
	});

	let doc = $state<RecipeDoc | null>(null);
	let docError = $state<string | null>(null);
	let docLoading = $state(false);
	/** An unsaved new recipe being filled in; it is only committed when the editor saves it. */
	let draft = $state<{ doc: RecipeDoc } | null>(null);
	let recipeDialog = $state<'delete' | null>(null);
	let renaming = $state(false);
	let renameValue = $state('');
	// Open state of every folder in the sidebar tree; a missing entry means closed.
	let open = $state<Record<string, boolean>>({});

	let folderPaths = $derived.by(() => {
		const paths: string[] = [];
		const walk = (node: TreeFolder) => {
			for (const child of node.children) {
				if (child.kind !== 'folder') continue;
				paths.push(child.path);
				walk(child);
			}
		};
		walk(repoStore.tree);
		return paths;
	});

	function ancestorsOf(target: string): Record<string, boolean> {
		const result: Record<string, boolean> = {};
		const parts = target.split('/');
		for (let i = 1; i <= parts.length; i++) result[parts.slice(0, i).join('/')] = true;
		return result;
	}

	// Folders start collapsed when a repository opens.
	$effect(() => {
		void src;
		open = {};
	});

	// Navigating reveals the current location without closing anything else.
	$effect(() => {
		const current = path;
		untrack(() => {
			if (current) open = { ...open, ...ancestorsOf(current) };
		});
	});

	let wasFiltering = false;
	$effect(() => {
		const filtering = repoStore.isFiltering;
		const paths = folderPaths;
		untrack(() => {
			if (filtering) {
				open = Object.fromEntries(paths.map((item) => [item, true]));
			} else if (wasFiltering) {
				open = path ? ancestorsOf(path) : {};
			}
		});
		wasFiltering = filtering;
	});

	// True once every folder is open, however that happened.
	let foldersAreExpanded = $derived(folderPaths.length > 0 && folderPaths.every((item) => open[item]));

	function toggleFolder(folderPath: string) {
		open = { ...open, [folderPath]: !open[folderPath] };
	}

	// A mix of open and closed folders expands everything; only a fully open tree collapses.
	function toggleFolders() {
		const next = !foldersAreExpanded;
		open = Object.fromEntries(folderPaths.map((item) => [item, next]));
	}
	let currentFolder = $derived(entry ? parentFolder(path) : folder ? path : '');

	function openCreate(folderPath: string) {
		const relative = joinPath(folderPath, 'new-recipe.md');
		renameValue = relative;
		draft = {
			doc: parseRecipe(
				{ path: toFull(relative, repoStore.basePath), sha: 'draft' },
				scaffoldRecipe(repoStore.template)
			)
		};
	}

	$effect(() => {
		void path;
		void editing;
		recipeDialog = null;
		draft = null;
		renaming = false;
		renameValue = path;
	});

	function closeDraft(destination?: string) {
		draft = null;
		void goto(`/r/${src}/${encodeURI(destination ?? path)}`);
	}

	$effect(() => {
		const target = entry;
		if (!target) {
			doc = null;
			docError = null;
			return;
		}

		let cancelled = false;
		docLoading = true;
		docError = null;

		repoStore
			.getDoc(target.path)
			.then((result) => {
				if (!cancelled) doc = result;
			})
			.catch((error: unknown) => {
				if (!cancelled) docError = error instanceof Error ? error.message : String(error);
			})
			.finally(() => {
				if (!cancelled) docLoading = false;
			});

		return () => {
			cancelled = true;
		};
	});

	let rootLabel = $derived(
		repoStore.ref
			? (profileStore.profileFor(repoStore.ref)?.name?.trim() || repoStore.ref.repo)
			: 'Repository'
	);

	// At the repository root the cards show view history; filtering or browsing into a folder shows the tree.
	let showRecent = $derived(path === '' && !repoStore.isFiltering);
	let recentItems = $derived(
		historyStore.items.flatMap((item) => {
			const full = repoStore.basePath
				? `${repoStore.basePath.replace(/\/+$/, '')}/${item.path}`
				: item.path;
			const recipe = repoStore.recipes.find((candidate) => candidate.path === full);
			return recipe ? [{ path: item.path, title: recipe.title, tags: recipe.tags }] : [];
		})
	);

	const PAGE_SIZE = 12;
	let recentLimit = $state(PAGE_SIZE);
	let childLimit = $state(PAGE_SIZE);
	$effect(() => {
		void path;
		void repoStore.isFiltering;
		recentLimit = PAGE_SIZE;
		childLimit = PAGE_SIZE;
	});

	$effect(() => {
		const ref = decoded.ref;
		if (ref) void historyStore.load(ref);
	});

	$effect(() => {
		const ref = decoded.ref;
		if (ref && entry && doc && !editing) void historyStore.record(ref, path, doc.title);
	});
	let notFound = $derived(
		repoStore.status === 'ready' && !repoStore.indexing && !entry && folder === null
	);
</script>

<svelte:head>
	<title>{doc ? `${doc.title} — Hotdish` : `${rootLabel} — Hotdish`}</title>
</svelte:head>

{#if decoded.error}
	<p class="banner error">That share link could not be read ({decoded.error}).</p>
	<p>
		<a class="icon-link" href="/" title="Open a different repository" aria-label="Open a different repository">
			<Icon name="home" size={20} />
		</a>
	</p>
{:else if repoStore.status === 'error' && repoStore.error}
	<div class="banner error">
		<p><strong>{repoStore.error.message}</strong></p>
		{#if repoStore.error.hint}<p>{repoStore.error.hint}</p>{/if}
	</div>
	<div class="row actions">
		<button
			type="button"
			class="icon-button"
			title="Retry"
			aria-label="Retry"
			onclick={() => repoStore.reload()}
		>
			<Icon name="refresh" />
		</button>
		<a class="icon-link" href="/" title="Add an access token" aria-label="Add an access token">
			<Icon name="key" size={20} />
		</a>
	</div>
{:else}
	<div class="layout" class:menu-open={navStore.open}>
		<aside id="recipe-nav" class="no-print" class:open={navStore.open}>
			<TagFilter />

			{#if repoStore.indexing}
				<p class="muted progress">
					Indexing {repoStore.indexed} of {repoStore.indexTotal} recipes…
				</p>
			{/if}

			{#if repoStore.status === 'ready'}
				<div class="side-head">
					<div class="side-heading">
						<button
							type="button"
							class="icon-button"
							title={foldersAreExpanded ? 'Collapse all folders' : 'Expand all folders'}
							aria-label={foldersAreExpanded ? 'Collapse all folders' : 'Expand all folders'}
							aria-expanded={foldersAreExpanded}
							onclick={toggleFolders}
						>
							<Icon
								name={foldersAreExpanded ? 'collapse' : 'expand'}
								size={14}
							/>
						</button>
						<a class="side-label" href={`/r/${src}`} title="Repository home">{rootLabel}</a>
					</div>
				</div>
			{/if}

			{#if repoStore.tree.children.length > 0}
				<FolderTree
					node={repoStore.tree}
					{src}
					currentPath={path}
					{open}
					ontoggle={toggleFolder}
				/>
			{:else if repoStore.status === 'ready' && !repoStore.indexing}
				<p class="muted">
					{repoStore.isFiltering ? 'No recipes match those filters.' : 'No markdown files found.'}
				</p>
			{/if}

			{#if repoStore.truncated}
				<p class="banner warn">
					This repository is too large to list completely. Some recipes may be missing.
				</p>
			{/if}

			{#if repoStore.skipped.length > 0}
				<details class="skipped">
					<summary>{repoStore.skipped.length} file(s) could not be read</summary>
					<ul>
						{#each repoStore.skipped as skippedPath (skippedPath)}
							<li>{skippedPath}</li>
						{/each}
					</ul>
				</details>
			{/if}
		</aside>

		<section class="content">
			<div class="head no-print">
				<Breadcrumbs
					{src}
					{path}
					{rootLabel}
					renamable={Boolean(draft || (entry && editing && doc))}
					forceEdit={Boolean(draft)}
					bind:renaming
					bind:value={renameValue}
				/>
				<div class="head-actions">
					{#if entry && !editing}
						<div class="split">
							<a
								class="part"
								href={`/r/${src}/${encodeURI(path)}?edit`}
								title="Edit"
								aria-label="Edit"
							>
								<Icon name="edit" />
							</a>
							<button
								type="button"
								class="part danger-hover"
								title="Delete"
								aria-label="Delete"
								disabled={!doc}
								onclick={() => (recipeDialog = 'delete')}
							>
								<Icon name="trash" />
							</button>
						</div>
					{:else if folder}
						<button
							type="button"
							class="icon-button"
							title="New recipe"
							aria-label="New recipe"
							onclick={() => openCreate(path)}
						>
							<Icon name="plus" />
						</button>
					{/if}
					<ShareButton source={sourceLink} />
				</div>
			</div>

			{#if repoStore.templateError}
				<p class="banner warn">
					The repository template could not be used ({repoStore.templateError}). Editing falls
					back to plain markdown.
				</p>
			{/if}

			{#if draft}
				{#await loadWithTimeout(() => import('$lib/editor/RecipeEditor.svelte'))}
					<Loading label="Loading editor" />
				{:then module}
					{@const Editor = module.default}
					{#key draft.doc.path}
						<Editor doc={draft.doc} isNew bind:targetRelative={renameValue} onclose={closeDraft} />
					{/key}
				{:catch error}
					<p class="banner error">
						The editor could not be loaded ({error instanceof Error
							? error.message
							: String(error)}).
					</p>
				{/await}
			{:else if entry}
				{#if docError}
					<p class="banner error">{docError}</p>
				{:else if docLoading && !doc}
					<Loading label="Loading recipe" />
				{:else if doc}
					{#if editing}
						{#await loadWithTimeout(() => import('$lib/editor/RecipeEditor.svelte'))}
							<Loading label="Loading editor" />
						{:then module}
							{@const Editor = module.default}
							{#key doc.sha}
								<Editor
									{doc}
									targetRelative={renameValue}
									onclose={(destination) => goto(`/r/${src}/${encodeURI(destination ?? path)}`)}
								/>
							{/key}
						{:catch error}
							<p class="banner error">
								The editor could not be loaded ({error instanceof Error
									? error.message
									: String(error)}).
							</p>
						{/await}
					{:else}
						<RecipeView {doc} />
					{/if}
				{/if}
			{:else if folder}
				{#if showRecent && recentItems.length > 0}
					<h2 class="recent-title" title="Recently viewed">
						<Icon name="clock" size={20} /><span class="visually-hidden">Recently viewed</span>
					</h2>
					<ul class="cards">
						{#each recentItems.slice(0, recentLimit) as item (item.path)}
							<li>
								<a class="card entry" href={`/r/${src}/${encodeURI(item.path)}`}>
									<span class="head-row">
										<span class="kind"><Icon name="file" size={18} /></span>
										<span class="label">{item.title}</span>
									</span>
									{#if item.tags.length > 0}
										<span class="sub tags">
											{#each item.tags.slice(0, 4) as tag (tag)}
												<span class="tag">{tag}</span>
											{/each}
										</span>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
					{#if recentItems.length > recentLimit}
						<button
							type="button"
							class="icon-button more"
							title="Show all recent recipes"
							aria-label="Show all recent recipes"
							onclick={() => (recentLimit = Infinity)}
						>
							<Icon name="expand" />
						</button>
					{/if}
					<hr class="divider" />
				{/if}
				{#if folder.children.length === 0}
					{#if repoStore.status === 'ready' && !repoStore.indexing}
						<EmptyState icon="empty" label="This folder is empty." />
					{/if}
				{:else}
					<ul class="cards">
						{#each folder.children.slice(0, childLimit) as child (child.path)}
							<li>
								<a class="card entry" href={`/r/${src}/${encodeURI(child.path)}`}>
									<span class="head-row">
										<span class="kind">
											<Icon name={child.kind === 'folder' ? 'folder' : 'file'} size={18} />
											{#if child.kind === 'folder'}
												<span
													class="count"
													title="{child.count} recipes"
													aria-label="{child.count} recipes"
												>
													{child.count}
												</span>
											{/if}
										</span>
										<span class="label">
											{child.kind === 'folder' ? child.name : child.recipe.title}
										</span>
									</span>
									{#if child.kind !== 'folder' && child.recipe.tags.length > 0}
										<span class="sub tags">
											{#each child.recipe.tags.slice(0, 4) as tag (tag)}
												<span class="tag">{tag}</span>
											{/each}
										</span>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
					{#if folder.children.length > childLimit}
						<button
							type="button"
							class="icon-button more"
							title="Show all items"
							aria-label="Show all items"
							onclick={() => (childLimit = Infinity)}
						>
							<Icon name="expand" />
						</button>
					{/if}
				{/if}
			{:else if notFound}
				<p class="banner warn nothing" title="Nothing found" role="status">
					<Icon name="search" size={18} /><code>{path}</code>
				</p>
				<p>
					<a
						class="icon-link"
						href={`/r/${src}`}
						title="Back to the top of this repository"
						aria-label="Back to the top of this repository"
					>
						<Icon name="up" size={20} />
					</a>
				</p>
			{:else}
				<Loading label="Loading repository" />
			{/if}
		</section>
	</div>

	{#if doc && entry && recipeDialog === 'delete'}
		<DeleteRecipe {doc} {src} onclose={() => (recipeDialog = null)} />
	{/if}
{/if}

<style>
	.layout {
		display: grid;
		grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
		gap: 1.5rem;
		align-items: start;
	}

	aside {
		position: sticky;
		/* Header (56px bar + 1px border) plus main's top padding (1.5rem): exactly where the list
		   naturally sits, so it neither shifts on load nor nudges when it starts to stick. */
		top: calc(57px + 1.5rem);
		/* Viewport minus header (57px) and main's vertical padding (1.5rem + 2.5rem), so a
		   full-height list never makes the page itself scroll. */
		max-height: calc(100vh - 57px - 4rem);
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
		/* Room for focus outlines, which overflow-y would otherwise clip. */
		padding: 4px;
	}

	.progress {
		font-size: 0.8rem;
	}

	.nothing {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.recent-title {
		font-size: 1rem;
		margin: 0 0 0.6rem;
		color: var(--text-dim);
	}
	.divider {
		border: 0;
		border-top: 1px solid var(--border);
		margin: 1.25rem 0;
	}
	.more {
		display: flex;
		margin: 0.75rem auto 0;
	}

	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}
	.head-actions {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.split {
		display: inline-flex;
	}
	.part {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.4rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: 0;
		background: var(--surface);
		color: var(--text);
		line-height: 0;
		cursor: pointer;
	}
	.part:hover:not(:disabled) {
		text-decoration: none;
		border-color: var(--accent);
		position: relative;
	}
	.part.danger-hover:hover:not(:disabled) {
		border-color: var(--danger);
		color: var(--danger);
	}
	.part:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.split > .part:first-child {
		border-radius: var(--radius-sm) 0 0 var(--radius-sm);
	}
	.split > .part:last-child {
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
	}
	.split > .part + .part {
		margin-left: -1px;
	}

	.side-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.4rem;
	}
	.side-heading {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.side-label {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.side-label:hover {
		color: var(--accent);
		text-decoration: none;
	}
	.side-head .icon-button {
		padding: 0.25rem 0.4rem;
	}
	.side-heading .icon-button {
		padding: 0.2rem;
	}

	.cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 0.6rem;
	}

	.cards > li {
		display: flex;
	}

	.entry {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		color: var(--text);
		padding: 0.75rem;
	}
	.entry:hover {
		text-decoration: none;
		border-color: var(--accent);
	}
	.head-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
	}
	.kind {
		font-size: 1.1rem;
		display: inline-flex;
		position: relative;
		flex: none;
		color: var(--text-dim);
	}
	.count {
		position: absolute;
		top: -0.45rem;
		right: -0.6rem;
		min-width: 1rem;
		padding: 0 0.25rem;
		box-sizing: border-box;
		border-radius: 999px;
		background: var(--accent);
		color: #fff;
		font-size: 0.68rem;
		font-weight: 600;
		line-height: 1rem;
		text-align: center;
	}
	.label {
		font-weight: 600;
	}
	.sub {
		font-size: 0.78rem;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.actions {
		margin-top: 0.75rem;
	}

	.skipped {
		margin-top: 1rem;
		font-size: 0.8rem;
		color: var(--text-dim);
	}

	@media (max-width: 860px) {
		.layout {
			grid-template-columns: 1fr;
		}
		aside {
			position: static;
			max-height: none;
			display: none;
		}
		aside.open {
			display: block;
		}
		.menu-open .content {
			display: none;
		}
		.head {
			flex-wrap: wrap;
		}
	}
</style>
