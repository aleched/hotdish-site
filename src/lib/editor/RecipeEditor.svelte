<script lang="ts">
	import { parseFrontmatter, serializeFrontmatter } from '$lib/markdown/frontmatter';
	import type { RecipeDoc } from '$lib/markdown/recipe';
	import { renderMarkdown } from '$lib/markdown/render';
	import { repoStore } from '$lib/store/repo.svelte';
	import { structureDocument, type StructuredDoc } from '$lib/template/parse';
	import { serializeDocument } from '$lib/template/serialize';
	import StructuredForm from '$lib/ui/StructuredForm.svelte';
	import { diffLines } from '$lib/util/diff';
	import { ForgeError, describeForgeError } from '$lib/forge/errors';
	import Milkdown from './Milkdown.svelte';

	type Mode = 'form' | 'rich' | 'source';

	interface Props {
		doc: RecipeDoc;
		onclose?: () => void;
	}

	let { doc, onclose }: Props = $props();

	/**
	 * A frontmatter block that YAML could not parse would be silently dropped by any structured
	 * edit, so those files are only ever editable as raw text.
	 */
	// The editor works on a snapshot taken at mount; the parent re-mounts it (keyed by sha) if
	// the underlying document changes.
	// svelte-ignore state_referenced_locally
	const rawOnly = Boolean(doc.frontmatterError);

	let mode = $state<Mode>(rawOnly ? 'source' : 'form');
	// svelte-ignore state_referenced_locally
	let fields = $state<Record<string, unknown>>($state.snapshot(doc.fields));
	// svelte-ignore state_referenced_locally
	let body = $state(doc.body);
	// svelte-ignore state_referenced_locally
	let rawText = $state(doc.raw);
	let structured = $state<StructuredDoc | null>(null);
	let richEditor = $state<{ getMarkdown(): string | null } | null>(null);

	let saving = $state(false);
	let saveError = $state<{ message: string; hint?: string } | null>(null);
	let conflict = $state(false);
	let message = $state('');
	let confirming = $state(false);

	if (!rawOnly) structured = toStructured();

	function toStructured(): StructuredDoc {
		const result = structureDocument(body, repoStore.template);
		result.fields = fields;
		return result;
	}

	/** Pulls the latest content out of whichever editor is active. */
	function capture(): void {
		if (rawOnly) return;
		if (mode === 'form' && structured) {
			const serialized = serializeDocument(structured);
			const parsed = parseFrontmatter(serialized);
			fields = parsed.present ? parsed.data : fields;
			body = parsed.body;
		} else if (mode === 'rich') {
			const markdown = richEditor?.getMarkdown();
			if (markdown !== null && markdown !== undefined) body = markdown;
		}
	}

	function setMode(next: Mode) {
		if (next === mode) return;
		capture();
		if (next === 'form') structured = toStructured();
		mode = next;
	}

	let currentRaw = $derived.by(() => {
		if (rawOnly) return rawText;
		// Touch the reactive sources so the preview and dirty state stay live.
		void structured;
		void body;
		void fields;
		if (mode === 'form' && structured) return serializeDocument(structured);
		return serializeFrontmatter(fields, body);
	});

	let dirty = $derived(currentRaw.trim() !== doc.raw.trim());
	let diff = $derived(diffLines(doc.raw, currentRaw));

	let previewHtml = $derived.by(() => {
		if (mode !== 'source') return '';
		try {
			return renderMarkdown(rawOnly ? parseFrontmatter(rawText).body : body);
		} catch {
			return '';
		}
	});

	function beforeUnload(event: BeforeUnloadEvent) {
		if (!dirty) return;
		event.preventDefault();
		event.returnValue = '';
	}

	function startSave() {
		capture();
		saveError = null;
		conflict = false;
		if (!message.trim()) message = `Update ${doc.path.split('/').pop()}`;
		confirming = true;
	}

	async function commit() {
		const provider = repoStore.provider;
		const branch = repoStore.resolvedRef;
		if (!provider || !branch) {
			saveError = { message: 'The repository is not loaded.' };
			return;
		}
		if (!provider.authenticated) {
			saveError = {
				message: 'An access token with write permission is required to save.',
				hint: 'Add one in Settings for this repository.'
			};
			return;
		}

		saving = true;
		saveError = null;

		try {
			const content = currentRaw.endsWith('\n') ? currentRaw : `${currentRaw}\n`;
			// Prefer the sha the store knows about: a previous save in this session may have moved it.
			const knownSha = repoStore.entryFor(doc.path)?.sha ?? doc.sha;
			const baseSha = await provider.resolveWriteBase(doc.path, branch, knownSha);
			const result = await provider.writeFile({
				path: doc.path,
				content,
				baseSha,
				message: message.trim() || `Update ${doc.path}`,
				branch
			});

			repoStore.applySavedDoc(doc.path, content, result.sha);
			confirming = false;
			onclose?.();
		} catch (error) {
			const described = describeForgeError(error);
			saveError = described;
			conflict = error instanceof ForgeError && error.kind === 'conflict';
		} finally {
			saving = false;
		}
	}

	async function reloadFromRepo() {
		await repoStore.reload();
		onclose?.();
	}

	function cancel() {
		if (dirty && !window.confirm('Discard your unsaved changes?')) return;
		onclose?.();
	}
</script>

<svelte:window onbeforeunload={beforeUnload} />

<div class="editor stack">
	<header class="bar">
		<div class="tabs" role="tablist" aria-label="Editing mode">
			{#if !rawOnly}
				<button
					type="button"
					role="tab"
					aria-selected={mode === 'form'}
					class:active={mode === 'form'}
					onclick={() => setMode('form')}
				>
					Form
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={mode === 'rich'}
					class:active={mode === 'rich'}
					onclick={() => setMode('rich')}
				>
					Rich text
				</button>
			{/if}
			<button
				type="button"
				role="tab"
				aria-selected={mode === 'source'}
				class:active={mode === 'source'}
				onclick={() => setMode('source')}
			>
				Markdown
			</button>
		</div>

		<div class="row">
			{#if dirty}<span class="muted small">Unsaved changes</span>{/if}
			<button type="button" onclick={cancel}>Cancel</button>
			<button class="primary" type="button" disabled={!dirty || saving} onclick={startSave}>
				Save
			</button>
		</div>
	</header>

	{#if rawOnly}
		<p class="banner warn">
			The frontmatter in this file could not be parsed ({doc.frontmatterError}). To avoid losing
			it, only raw markdown editing is available.
		</p>
	{/if}

	{#if repoStore.template && !rawOnly}
		<p class="muted small">
			Using the <strong>{repoStore.template.name}</strong> template from this repository.
		</p>
	{/if}

	{#if mode === 'form' && structured}
		<StructuredForm doc={structured} template={repoStore.template} />
	{:else if mode === 'rich'}
		<Milkdown bind:this={richEditor} value={body} onchange={(markdown) => (body = markdown)} />
	{:else}
		<div class="source">
			{#if rawOnly}
				<textarea
					class="raw"
					spellcheck="false"
					rows="24"
					bind:value={rawText}
					aria-label="Markdown source"
				></textarea>
			{:else}
				<textarea
					class="raw"
					spellcheck="false"
					rows="24"
					bind:value={body}
					aria-label="Markdown source"
				></textarea>
			{/if}
			{#if previewHtml}
				<div class="prose preview">{@html previewHtml}</div>
			{/if}
		</div>
	{/if}

	{#if confirming}
		<div class="card stack confirm">
			<h2>Review changes</h2>

			{#if diff.identical}
				<p class="muted">No changes to save.</p>
			{:else}
				<p class="muted small">
					+{diff.added} line(s), −{diff.removed} line(s) in
					<code>{doc.path}</code>
				</p>
				<pre class="diff">{#each diff.lines as line, index (index)}<span class={line.kind}
						>{line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}{line.text}</span
					>{'\n'}{/each}</pre>
			{/if}

			<div class="field">
				<label class="label" for="commit-message">Commit message</label>
				<input id="commit-message" type="text" bind:value={message} />
			</div>

			{#if saveError}
				<div class="banner error">
					<p><strong>{saveError.message}</strong></p>
					{#if saveError.hint}<p>{saveError.hint}</p>{/if}
					{#if conflict}
						<p>
							The file changed in the repository since it was loaded. Reload to get the latest
							version — your edits here will be lost, so copy anything you need first.
						</p>
						<button type="button" onclick={reloadFromRepo}>Reload from repository</button>
					{/if}
				</div>
			{/if}

			<div class="row">
				<button
					class="primary"
					type="button"
					disabled={saving || diff.identical}
					onclick={commit}
				>
					{saving ? 'Saving…' : 'Commit'}
				</button>
				<button type="button" disabled={saving} onclick={() => (confirming = false)}>
					Keep editing
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		position: sticky;
		top: 56px;
		background: var(--bg);
		padding: 0.5rem 0;
		z-index: 10;
	}

	.tabs {
		display: flex;
		gap: 0.25rem;
	}
	.tabs button.active {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}

	.small {
		font-size: 0.78rem;
		margin: 0;
	}

	.source {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 1rem;
	}
	.raw {
		font-family: var(--mono);
		font-size: 0.88rem;
		resize: vertical;
		min-height: 420px;
	}
	.preview {
		border-left: 1px solid var(--border);
		padding-left: 1rem;
		overflow-x: auto;
	}

	.confirm h2 {
		font-size: 0.95rem;
		margin: 0;
	}

	.diff {
		max-height: 320px;
		overflow: auto;
		background: var(--surface-2);
		border-radius: var(--radius-sm);
		padding: 0.6rem;
		font-size: 0.8rem;
		margin: 0;
	}
	.diff span {
		display: block;
		white-space: pre-wrap;
	}
	.diff .added {
		color: var(--ok, #16a34a);
	}
	.diff .removed {
		color: var(--danger);
	}
	.diff .context {
		color: var(--text-dim);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.label {
		font-size: 0.85rem;
		font-weight: 600;
	}

	@media (max-width: 900px) {
		.source {
			grid-template-columns: 1fr;
		}
		.preview {
			border-left: none;
			padding-left: 0;
		}
	}
</style>
