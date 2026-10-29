<script lang="ts">
	import type { TreeFolder } from '$lib/tree';
	import FolderTree from './FolderTree.svelte';

	interface Props {
		node: TreeFolder;
		src: string;
		currentPath?: string;
		/** Force every folder open, used while a search or tag filter is active. */
		expandAll?: boolean;
		depth?: number;
	}

	let { node, src, currentPath = '', expandAll = false, depth = 0 }: Props = $props();

	function isAncestor(folderPath: string): boolean {
		return currentPath === folderPath || currentPath.startsWith(`${folderPath}/`);
	}
</script>

<ul class:root={depth === 0}>
	{#each node.children as child (child.path)}
		{#if child.kind === 'folder'}
			<li>
				<details open={expandAll || isAncestor(child.path)}>
					<summary>
						<span class="name">{child.name}</span>
						<span class="count">{child.count}</span>
					</summary>
					<FolderTree
						node={child}
						{src}
						{currentPath}
						{expandAll}
						depth={depth + 1}
					/>
				</details>
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

	summary {
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.2rem 0.35rem;
		border-radius: var(--radius-sm);
		font-size: 0.9rem;
		font-weight: 600;
	}
	summary:hover {
		background: var(--surface-2);
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
