<script lang="ts">
	interface Crumb {
		label: string;
		href: string;
	}

	interface Props {
		src: string;
		path: string;
		rootLabel: string;
	}

	let { src, path, rootLabel }: Props = $props();

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
</script>

<nav aria-label="Breadcrumb">
	<ol>
		{#each crumbs as crumb, index (crumb.href)}
			<li>
				{#if index === crumbs.length - 1}
					<span aria-current="page">{crumb.label}</span>
				{:else}
					<a href={crumb.href}>{crumb.label}</a>
					<span class="sep" aria-hidden="true">/</span>
				{/if}
			</li>
		{/each}
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
	span[aria-current] {
		color: var(--text);
		font-weight: 600;
	}
</style>
