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
	import { findFolder } from '$lib/tree';
	import { FORGE_LABELS } from '$lib/forge/factory';
	import { untrack } from 'svelte';
	import { parentFolder } from '$lib/paths';
	import { authStore } from '$lib/store/auth.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import TokenPrompt from '$lib/ui/TokenPrompt.svelte';
	import DeleteRecipe from '$lib/editor/DeleteRecipe.svelte';
	import MoveRecipe from '$lib/editor/MoveRecipe.svelte';

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
	/** Folder preselected in the open "New recipe" dialog, or null when it is closed. */
	let newIn = $state<string | null>(null);
	let recipeDialog = $state<'move' | 'delete' | null>(null);
	let foldersExpanded = $state<boolean | null>(null);
	let foldersAreExpanded = $derived(foldersExpanded ?? repoStore.isFiltering);

	let canWrite = $derived(repoStore.provider?.authenticated ?? false);
	let currentFolder = $derived(entry ? parentFolder(path) : folder ? path : '');

	/** Runs a write action, first asking for an access token if none is configured. */
	async function withToken(action: () => void) {
		if (await authStore.requireToken()) action();
	}

	function openCreate(folderPath: string) {
		void withToken(() => (newIn = folderPath));
	}

	function toggleFolders() {
		foldersExpanded = !foldersAreExpanded;
	}

	function startEdit(event: MouseEvent) {
		if (canWrite) return;
		event.preventDefault();
		void withToken(() => goto(`/r/${src}/${encodeURI(path)}?edit`));
	}

	// An ?edit link opened without a token asks for one; cancelling falls back to viewing.
	$effect(() => {
		if (!editing || !entry || canWrite || repoStore.status !== 'ready') return;
		const viewUrl = `/r/${src}/${encodeURI(path)}`;
		untrack(() => {
			void authStore.requireToken().then((ok) => {
				if (!ok) void goto(viewUrl, { replaceState: true });
			});
		});
	});

	$effect(() => {
		void path;
		recipeDialog = null;
	});

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

	let rootLabel = $derived(repoStore.ref ? repoStore.ref.repo : 'Repository');

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
	<p><a href="/">Open a different repository</a></p>
{:else if repoStore.status === 'error' && repoStore.error}
	<div class="banner error">
		<p><strong>{repoStore.error.message}</strong></p>
		{#if repoStore.error.hint}<p>{repoStore.error.hint}</p>{/if}
	</div>
	<div class="row actions">
		<button type="button" onclick={() => repoStore.reload()}>Retry</button>
		<a href="/">Add an access token</a>
	</div>
{:else}
	<div class="layout" class:menu-open={navStore.open}>
		<aside id="recipe-nav" class="no-print" class:open={navStore.open}>
			<a class="about-link" href="/about">About</a>
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
						<span class="side-label">Recipes</span>
					</div>
					<button
						type="button"
						class="icon-button"
						title="New recipe"
						aria-label="New recipe"
						onclick={() => openCreate(currentFolder)}
					>
						<Icon name="plus" size={14} />
					</button>
				</div>
			{/if}

			{#if repoStore.tree.children.length > 0}
				<FolderTree
					node={repoStore.tree}
					{src}
					currentPath={path}
					expandAll={foldersExpanded ?? repoStore.isFiltering}
					collapseAll={foldersExpanded === false}
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
				<Breadcrumbs {src} {path} {rootLabel} />
				<div class="head-actions">
					{#if entry && !editing}
						<a
							class="button-link icon-link"
							href={`/r/${src}/${encodeURI(path)}?edit`}
							title="Edit"
							aria-label="Edit"
							onclick={startEdit}
						>
							<Icon name="edit" />
						</a>
						<button
							type="button"
							class="icon-button"
							title="Move or rename"
							aria-label="Move or rename"
							disabled={!doc}
							onclick={() => withToken(() => (recipeDialog = 'move'))}
						>
							<Icon name="move" />
						</button>
						<button
							type="button"
							class="icon-button danger-hover"
							title="Delete"
							aria-label="Delete"
							disabled={!doc}
							onclick={() => withToken(() => (recipeDialog = 'delete'))}
						>
							<Icon name="trash" />
						</button>
					{:else if folder && !showRecent}
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

			{#if entry}
				{#if docError}
					<p class="banner error">{docError}</p>
				{:else if docLoading && !doc}
					<p class="muted">Loading recipe…</p>
				{:else if doc}
					{#if editing}
						{#if !canWrite}
							<p class="muted">An access token is needed to edit this recipe.</p>
						{:else}
							{#await loadWithTimeout(() => import('$lib/editor/RecipeEditor.svelte'))}
								<p class="muted">Loading editor…</p>
							{:then module}
								{@const Editor = module.default}
								{#key doc.sha}
									<Editor {doc} onclose={() => goto(`/r/${src}/${encodeURI(path)}`)} />
								{/key}
							{:catch error}
								<p class="banner error">
									The editor could not be loaded ({error instanceof Error
										? error.message
										: String(error)}).
								</p>
							{/await}
						{/if}
					{:else}
						<RecipeView {doc} />
					{/if}
				{/if}
			{:else if folder}
				<h1 class="folder-title">{path ? folder.name : rootLabel}</h1>

				{#if showRecent}
					<div class="recent-actions">
						<button
							type="button"
							class="icon-button"
							title="New recipe"
							aria-label="New recipe"
							onclick={() => openCreate('')}
						>
							<Icon name="plus" />
						</button>
					</div>
					<h2 class="recent-title">Recently viewed</h2>
					{#if recentItems.length > 0}
						<ul class="cards">
							{#each recentItems as item (item.path)}
								<li>
									<a class="card entry" href={`/r/${src}/${encodeURI(item.path)}`}>
										<span class="kind">📄</span>
										<span class="label">{item.title}</span>
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
					{:else if repoStore.status === 'ready' && !repoStore.indexing}
						<p class="muted">No recipe view history</p>
					{/if}
				{:else if folder.children.length === 0}
					<p class="muted">This folder is empty.</p>
				{:else}
					<ul class="cards">
						{#each folder.children as child (child.path)}
							<li>
								<a class="card entry" href={`/r/${src}/${encodeURI(child.path)}`}>
									<span class="kind">{child.kind === 'folder' ? '📁' : '📄'}</span>
									<span class="label">
										{child.kind === 'folder' ? child.name : child.recipe.title}
									</span>
									{#if child.kind === 'folder'}
										<span class="muted sub">{child.count} recipes</span>
									{:else if child.recipe.tags.length > 0}
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
				{/if}
			{:else if notFound}
				<p class="banner warn">Nothing found at <code>{path}</code>.</p>
				<p><a href={`/r/${src}`}>Back to the top of this repository</a></p>
			{:else}
				<p class="muted">Loading repository…</p>
			{/if}
		</section>
	</div>

	{#if newIn !== null}
		{#await import('$lib/editor/NewRecipe.svelte') then module}
			{@const NewRecipe = module.default}
			<NewRecipe folderPath={newIn} {src} onclose={() => (newIn = null)} />
		{/await}
	{/if}

	{#if doc && entry && recipeDialog === 'move'}
		<MoveRecipe {doc} {src} onclose={() => (recipeDialog = null)} />
	{:else if doc && entry && recipeDialog === 'delete'}
		<DeleteRecipe {doc} {src} onclose={() => (recipeDialog = null)} />
	{/if}

	{#if authStore.prompting}
		<TokenPrompt />
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
		top: 72px;
		max-height: calc(100vh - 88px);
		overflow-y: auto;
		/* Room for focus outlines, which overflow-y would otherwise clip. */
		padding: 4px;
		margin: -4px;
	}

	.progress {
		font-size: 0.8rem;
	}

	.recent-title {
		font-size: 1rem;
		margin: 0 0 0.6rem;
		color: var(--text-dim);
	}

	.about-link {
		display: none;
		margin-bottom: 0.75rem;
		font-weight: 600;
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

	.button-link {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.4rem 0.75rem;
		color: var(--text);
		background: var(--surface);
		font-size: 0.9rem;
	}
	.icon-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.button-link:hover {
		text-decoration: none;
		border-color: var(--accent);
	}

	.folder-title {
		margin: 0 0 1rem;
		font-size: 1.4rem;
	}

	.recent-actions {
		display: flex;
		margin-bottom: 0.75rem;
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
		gap: 0.25rem;
	}
	.side-label {
		font-size: 0.78rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-dim);
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

	.entry {
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
	.kind {
		font-size: 1.1rem;
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
		.about-link {
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
