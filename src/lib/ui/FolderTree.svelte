<script lang="ts">
	import type { TreeFolder } from '$lib/tree';
	import FolderTree from './FolderTree.svelte';

	interface Props {
		node: TreeFolder;
		src: string;
		currentPath?: string;
		/** Open state per folder path; a missing entry means closed. */
		open: Record<string, boolean>;
		ontoggle: (folderPath: string) => void;
		depth?: number;
	}

	let { node, src, currentPath = '', open: openState, ontoggle, depth = 0 }: Props = $props();
</script>

<ul class:root={depth === 0}>
	{#each node.children as child (child.path)}
		{#if child.kind === 'folder'}
			{@const open = Boolean(openState[child.path])}
			<li>
				<div class="folder-row" class:active={currentPath === child.path}>
					<button
						type="button"
						class="chevron"
						class:open
						aria-expanded={open}
						aria-label={`${open ? 'Collapse' : 'Expand'} ${child.name}`}
						title={open ? 'Collapse' : 'Expand'}
						onclick={() => ontoggle(child.path)}
					>
						<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M6 3.5L10.5 8 6 12.5" />
						</svg>
					</button>
					<a class="folder-link" href={`/r/${src}/${encodeURI(child.path)}`}>
						<span class="name">{child.name}</span>
						<span class="count">{child.count}</span>
					</a>
				</div>
				{#if open}
					<FolderTree
						node={child}
						{src}
						{currentPath}
						open={openState}
						{ontoggle}
						depth={depth + 1}
					/>
				{/if}
			</li>
		{:else}
			<li>
				<a
					class="file"
					class:active={currentPath === child.path}
					href={`/r/${src}/${encodeURI(child.path)}`}
				>
					{child.recipe.title}
				</a>
			</li>
		{/if}
	{/each}
</ul>

<style>
	ul {
		list-style: none;
		margin: 0;
		padding-left: 0.85rem;
		border-left: 1px solid var(--border);
	}
	ul.root {
		padding-left: 0;
		border-left: none;
	}

	li {
		margin: 0.1rem 0;
	}

	.folder-row {
		display: flex;
		align-items: center;
		gap: 0.1rem;
		border-radius: var(--radius-sm);
	}
	.folder-row:hover {
		background: var(--surface-2);
	}
	.folder-row.active {
		background: var(--surface-2);
		box-shadow: inset 2px 0 0 var(--accent);
	}
	.chevron {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1.4rem;
		padding: 0.25rem 0;
		border: none;
		background: none;
		color: var(--text-dim);
		line-height: 0;
	}
	.chevron:hover:not(:disabled) {
		background: none;
		color: var(--accent);
	}
	.chevron svg {
		transition: transform 0.12s ease;
	}
	.chevron.open svg {
		transform: rotate(90deg);
	}
	.folder-link {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.2rem 0.35rem 0.2rem 0;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text);
	}
	.folder-link:hover {
		text-decoration: none;
	}

	.count {
		font-size: 0.7rem;
		color: var(--text-dim);
		font-weight: 400;
	}

	.file {
		display: block;
		padding: 0.2rem 0.35rem;
		border-radius: var(--radius-sm);
		font-size: 0.9rem;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.file:hover {
		background: var(--surface-2);
		text-decoration: none;
	}
	.file.active {
		background: var(--accent);
		color: #fff;
	}
</style>
