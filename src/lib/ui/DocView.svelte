<script lang="ts">
	import type { Doc } from '$lib/markdown/doc';
	import { renderMarkdown } from '$lib/markdown/render';
	import Icon from '$lib/ui/Icon.svelte';
	import { repoStore } from '$lib/store/repo.svelte';
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		doc: Doc;
	}

	let { doc }: Props = $props();

	let html = $derived.by(() => {
		try {
			return renderMarkdown(stripLeadingTitle(doc.body, doc.title));
		} catch (error) {
			return `<p class="banner error">${escapeHtml(
				m.doc_render_error({ error: error instanceof Error ? error.message : String(error) })
			)}</p>`;
		}
	});

	const META = [
		{ key: 'servings', label: m.recipe_servings(), icon: 'servings' },
		{ key: 'prep_time', label: m.recipe_prep_time(), icon: 'prep' },
		{ key: 'cook_time', label: m.recipe_cook_time(), icon: 'cook' }
	] as const;
	const HANDLED = ['title', 'tags', 'servings', 'prep_time', 'cook_time', 'source'];

	function has(value: unknown): boolean {
		return value !== null && value !== undefined && String(value).trim() !== '';
	}

	let metaItems = $derived(META.filter((item) => has(doc.fields[item.key])));
	let source = $derived(has(doc.fields.source) ? String(doc.fields.source).trim() : '');
	let isUrl = $derived(/^https?:\/\//i.test(source));

	let extras = $derived(
		Object.entries(doc.fields).filter(
			([key, value]) => !HANDLED.includes(key) && value !== null && value !== undefined
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
					title={m.doc_filter_by({ tag })}
				>
					{tag}
				</button>
			{/each}
		</div>
	{/if}

	{#if metaItems.length > 0}
		<div class="facts">
			{#each metaItems as item (item.key)}
				<span class="fact" title={item.label}>
					<Icon name={item.icon} size={16} />
					<span class="visually-hidden">{item.label}:</span>
					{formatValue(doc.fields[item.key])}
				</span>
			{/each}
		</div>
	{/if}

	{#if source}
		<div class="facts">
			<span class="fact" title={m.doc_source()}>
				<Icon name="link" size={16} />
				<span class="visually-hidden">{m.doc_source()}:</span>
				{#if isUrl}
					<a href={source} target="_blank" rel="noopener noreferrer">{source}</a>
				{:else}
					{source}
				{/if}
			</span>
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
			{m.doc_frontmatter_error({ error: doc.frontmatterError })}
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

	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 1.25rem;
		margin-bottom: 0.6rem;
		color: var(--text-dim);
		font-size: 0.9rem;
	}
	.fact {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
		overflow-wrap: anywhere;
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
