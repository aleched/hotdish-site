<script lang="ts">
	import type { Doc } from '$lib/markdown/doc';
	import { renderMarkdown } from '$lib/markdown/render';
	import Icon from '$lib/ui/Icon.svelte';
	import { repoStore } from '$lib/store/repo.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { editorPrefs } from '$lib/store/editorPrefs.svelte';
	import { strikeStore } from '$lib/store/strikes.svelte';
	import { strikeKeys } from '$lib/markdown/strikes';
	import { isIsoDate } from '$lib/template/schema';
	import { getLocale } from '$lib/paraglide/runtime.js';

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

	let factFields = $derived(
		(repoStore.template?.fields ?? []).filter(
			(field) =>
				field.key !== 'title' && field.key !== 'tags' && (field.icon || field.type === 'url')
		)
	);
	let handled = $derived(['title', 'tags', ...factFields.map((field) => field.key)]);

	function has(value: unknown): boolean {
		return value !== null && value !== undefined && String(value).trim() !== '';
	}

	let facts = $derived(
		factFields
			.filter((field) => has(doc.fields[field.key]))
			.map((field) => {
				const raw = formatValue(doc.fields[field.key]).trim();
				const text = field.type === 'date' ? formatDate(raw) : raw;
				return {
					key: field.key,
					label: field.label,
					icon: field.icon ?? 'link',
					text,
					href: field.type === 'url' && /^https?:\/\//i.test(text) ? text : null
				};
			})
	);

	let extras = $derived(
		Object.entries(doc.fields).filter(
			([key, value]) => !handled.includes(key) && value !== null && value !== undefined
		)
	);

	let prose = $state<HTMLElement>();
	let items = $state<{ el: HTMLElement; key: string }[]>([]);

	$effect(() => {
		if (repoStore.ref) void strikeStore.load(repoStore.ref, doc.path);
	});

	// Wrap each list item's own content so striking a parent leaves nested items alone.
	$effect(() => {
		void html;
		if (!prose || !editorPrefs.strikeLists) {
			for (const span of prose?.querySelectorAll<HTMLElement>('.strike-item') ?? []) {
				span.removeAttribute('role');
				span.removeAttribute('tabindex');
				span.removeAttribute('aria-pressed');
				span.parentElement?.classList.remove('strikable');
			}
			items = [];
			return;
		}
		const lis = Array.from(prose.querySelectorAll<HTMLLIElement>('li'));
		const spans = lis.map((li) => {
			let span = li.querySelector<HTMLElement>(':scope > .strike-item');
			if (!span) {
				span = document.createElement('span');
				span.className = 'strike-item';
				const nested = Array.from(li.children).find((child) => /^(UL|OL)$/.test(child.tagName));
				while (li.firstChild && li.firstChild !== nested) span.appendChild(li.firstChild);
				li.insertBefore(span, li.firstChild);
			}
			li.classList.add('strikable');
			// The span is the control so the li keeps its list-item role for screen readers.
			span.setAttribute('role', 'button');
			span.tabIndex = 0;
			return span;
		});
		const keys = strikeKeys(spans.map((span) => span.textContent ?? ''));
		items = spans.map((el, index) => ({ el, key: keys[index] }));
	});

	$effect(() => {
		for (const { el, key } of items) {
			const struck = strikeStore.keys.includes(key);
			el.classList.toggle('struck', struck);
			el.setAttribute('aria-pressed', String(struck));
		}
	});

	function onProseClick(event: MouseEvent) {
		if (!editorPrefs.strikeLists) return;
		if ((event.target as HTMLElement).closest('a')) return;
		if (window.getSelection()?.toString()) return;
		// Only the text itself is tappable, not the empty space to its right.
		const text = (event.target as HTMLElement).closest('.strike-item');
		const item = items.find((entry) => entry.el === text);
		if (item) void strikeStore.toggle(item.key);
	}

	function onProseKeydown(event: KeyboardEvent) {
		if (!editorPrefs.strikeLists || (event.key !== ' ' && event.key !== 'Enter')) return;
		const item = items.find((entry) => entry.el === event.target);
		if (!item) return;
		event.preventDefault();
		void strikeStore.toggle(item.key);
	}

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

	/** Shows a YYYY-MM-DD date in the reader's locale. Built from parts so no timezone can shift the day. */
	function formatDate(value: string): string {
		if (!isIsoDate(value)) return value;
		const [year, month, day] = value.split('-').map(Number);
		return new Date(year, month - 1, day).toLocaleDateString(getLocale(), { dateStyle: 'medium' });
	}

	function formatValue(value: unknown): string {
		if (Array.isArray(value)) return value.map((item) => String(item)).join(', ');
		if (value instanceof Date) return value.toISOString().slice(0, 10);
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

	{#if facts.length > 0}
		<div class="facts">
			{#each facts as fact (fact.key)}
				<span class="fact" title={fact.label}>
					<Icon name={fact.icon} size={16} />
					<span class="visually-hidden">{fact.label}:</span>
					{#if fact.href}
						<a href={fact.href} target="_blank" rel="noopener noreferrer">{fact.text}</a>
					{:else}
						{fact.text}
					{/if}
				</span>
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
			{m.doc_frontmatter_error({ error: doc.frontmatterError })}
		</p>
	{/if}

	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="prose" bind:this={prose} onclick={onProseClick} onkeydown={onProseKeydown}>
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
