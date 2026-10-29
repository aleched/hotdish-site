<script lang="ts">
	import type { RecipeDoc } from '$lib/markdown/recipe';
	import { renderMarkdown } from '$lib/markdown/render';
	import { repoStore } from '$lib/store/repo.svelte';

	interface Props {
		doc: RecipeDoc;
	}

	let { doc }: Props = $props();

	let html = $derived.by(() => {
		try {
			return renderMarkdown(stripLeadingTitle(doc.body, doc.title));
		} catch (error) {
			return `<p class="banner error">Could not render this recipe: ${escapeHtml(
				error instanceof Error ? error.message : String(error)
			)}</p>`;
		}
	});

	let extras = $derived(
		Object.entries(doc.fields).filter(
			([key, value]) => key !== 'title' && key !== 'tags' && value !== null && value !== undefined
		)
	);

	/** The heading is rendered from the title, so avoid showing it twice. */
	function stripLeadingTitle(body: string, title: string): string {
		const match = /^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\r?\n|$)/.exec(body);
		if (!match) return body;
		if (match[1].trim() !== title) return body;
		return body.slice(match[0].length);
	}

	function escapeHtml(value: string): string {
		return value.replace(/[&<>"]/g, (char) =>
			char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : '&quot;'
		);
	}

	function formatValue(value: unknown): string {
		if (Array.isArray(value)) return value.map((item) => String(item)).join(', ');
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	}
</script>

<article>
	<h1>{doc.title}</h1>

	{#if doc.tags.length > 0}
		<div class="tags">
			{#each doc.tags as tag (tag)}
				<button
					type="button"
					class="tag"
					onclick={() => repoStore.toggleTag(tag)}
					title={`Filter by ${tag}`}
				>
					{tag}
				</button>
			{/each}
		</div>
	{/if}

	{#if extras.length > 0}
		<dl class="meta">
			{#each extras as [key, value] (key)}
				<div>
					<dt>{key}</dt>
					<dd>{formatValue(value)}</dd>
				</div>
			{/each}
		</dl>
	{/if}

	{#if doc.frontmatterError}
		<p class="banner warn">
			Frontmatter could not be parsed ({doc.frontmatterError}). It is shown as part of the body
			and will be preserved exactly as written.
		</p>
	{/if}

	<div class="prose">
		<!-- Sanitized by renderMarkdown; raw HTML in source markdown is dropped. -->
		{@html html}
	</div>
</article>

<style>
	h1 {
		margin: 0 0 0.5rem;
		font-size: clamp(1.5rem, 3vw, 2rem);
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-bottom: 0.75rem;
	}
	.tags .tag {
		cursor: pointer;
		width: auto;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.25rem;
		margin: 0 0 1rem;
		padding: 0.6rem 0.8rem;
		background: var(--surface-2);
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
	}
	.meta div {
		display: flex;
		gap: 0.35rem;
	}
	.meta dt {
		font-weight: 600;
		color: var(--text-dim);
	}
	.meta dt::after {
		content: ':';
	}
	.meta dd {
		margin: 0;
	}

</style>
