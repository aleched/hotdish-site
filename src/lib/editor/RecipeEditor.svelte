<script lang="ts">
	import { parseFrontmatter, serializeFrontmatter } from '$lib/markdown/frontmatter';
	import type { RecipeDoc } from '$lib/markdown/recipe';
	import { renderMarkdown } from '$lib/markdown/render';
	import { repoStore } from '$lib/store/repo.svelte';
	import { structureDocument, type StructuredDoc } from '$lib/template/parse';
	import { serializeDocument } from '$lib/template/serialize';
	import StructuredForm from '$lib/ui/StructuredForm.svelte';
	import { diffLines } from '$lib/util/diff';
	import { ForgeError } from '$lib/forge/errors';
	import { commitMessages } from '$lib/paths';
	import { authStore } from '$lib/store/auth.svelte';
	import CommitDialog from '$lib/ui/CommitDialog.svelte';
	import { beforeNavigate } from '$app/navigation';
	import Milkdown from './Milkdown.svelte';
	import Icon from '$lib/ui/Icon.svelte';

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

	const ALL_MODES: { value: Mode; label: string; icon: 'form' | 'markdown' | 'rich' }[] = [
		{ value: 'form', label: 'Form', icon: 'form' },
		{ value: 'source', label: 'Markdown', icon: 'markdown' },
		{ value: 'rich', label: 'Rich text', icon: 'rich' }
	];
	const modes = ALL_MODES;

	function onModeKey(event: KeyboardEvent, index: number) {
		const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
		if (!step || rawOnly) return;
		event.preventDefault();
		const next = (index + step + modes.length) % modes.length;
		setMode(modes[next].value);
		const group = event.currentTarget as HTMLElement;
		// The first child is the sliding highlight, so the radios start at index 1.
		requestAnimationFrame(() =>
			(group.parentElement?.children[next + 1] as HTMLElement | undefined)?.focus()
		);
	}
	// svelte-ignore state_referenced_locally
	let fields = $state<Record<string, unknown>>($state.snapshot(doc.fields));
	// svelte-ignore state_referenced_locally
	let body = $state(doc.body);
	// svelte-ignore state_referenced_locally
	let rawText = $state(doc.raw);
	let structured = $state<StructuredDoc | null>(null);
	let richEditor = $state<{ getMarkdown(): string | null } | null>(null);

	let saving = $state(false);
	let saveError = $state<unknown>(null);
	let conflict = $state(false);
	let message = $state('');
	let confirming = $state(false);
	let resetKey = $state(0);
	let leaving = false;

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
		const title = typeof fields.title === 'string' && fields.title.trim() ? fields.title.trim() : doc.title;
		message = commitMessages.update(title);
		confirming = true;
	}

	async function commit() {
		const provider = repoStore.provider;
		const branch = repoStore.resolvedRef;
		if (!provider || !branch) {
			saveError = new Error('The repository is not loaded.');
			return;
		}
		if (!(await authStore.requireToken())) return;

		saving = true;
		saveError = null;
		conflict = false;

		try {
			const content = currentRaw.endsWith('\n') ? currentRaw : `${currentRaw}\n`;
			// Prefer the sha the store knows about: a previous save in this session may have moved it.
			const knownSha = repoStore.entryFor(doc.path)?.sha ?? doc.sha;
			const baseSha = await provider.resolveWriteBase(doc.path, branch, knownSha);
			const result = await provider.writeFile({
				path: doc.path,
				content,
				baseSha,
				message: message.trim(),
				branch
			});

			repoStore.applySavedDoc(doc.path, content, result.sha);
			confirming = false;
			leaving = true;
			onclose?.();
		} catch (error) {
			saveError = error;
			conflict = error instanceof ForgeError && error.kind === 'conflict';
		} finally {
			saving = false;
		}
	}

	async function reloadFromRepo() {
		await repoStore.reload();
		leaving = true;
		onclose?.();
	}

	function undo() {
		if (!window.confirm('Discard your unsaved changes?')) return;
		fields = $state.snapshot(doc.fields);
		body = doc.body;
		rawText = doc.raw;
		if (!rawOnly) structured = toStructured();
		// Re-mounts the active editor so it picks up the restored content.
		resetKey++;
	}

	function cancel() {
		if (dirty && !window.confirm('Discard your unsaved changes?')) return;
		leaving = true;
		onclose?.();
	}

	// Guards in-app navigation (links, back button); beforeunload covers closing the tab.
	beforeNavigate((navigation) => {
		if (leaving || !dirty || navigation.type === 'leave') return;
		if (!window.confirm('Discard your unsaved changes?')) navigation.cancel();
	});
</script>

<svelte:window onbeforeunload={beforeUnload} />

<div class="editor stack">
	<header class="bar">
		<div
			class="mode-toggle"
			role="radiogroup"
			aria-label="Editing mode"
			style:--n={modes.length}
			style:--i={Math.max(0, modes.findIndex((item) => item.value === mode))}
		>
			<span class="thumb" aria-hidden="true"></span>
			{#each modes as item, index (item.value)}
				{@const unavailable = rawOnly && item.value !== 'source'}
				<button
					type="button"
					role="radio"
					aria-checked={mode === item.value}
					aria-disabled={unavailable}
					aria-label={item.label}
					title={unavailable
						? `${item.label} is unavailable: the frontmatter could not be parsed`
						: item.label}
					tabindex={mode === item.value ? 0 : -1}
					class:on={mode === item.value}
					class:unavailable
					onclick={() => !unavailable && setMode(item.value)}
					onkeydown={(event) => onModeKey(event, index)}
				>
					<Icon name={item.icon} size={17} />
				</button>
			{/each}
		</div>

		<div class="split">
			{#if dirty}
				<button
					type="button"
					class="part"
					title="Undo changes"
					aria-label="Undo changes"
					disabled={saving}
					onclick={undo}
				>
					<Icon name="undo" />
				</button>
			{/if}
			<button
				type="button"
				class="part"
				title="Cancel"
				aria-label="Cancel"
				onclick={cancel}
			>
				<Icon name="cancel" />
			</button>
			<button
				class="part save"
				type="button"
				title="Save"
				aria-label="Save"
				disabled={!dirty || saving}
				onclick={startSave}
			>
				<Icon name="save" />
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
		{#key resetKey}
			<StructuredForm doc={structured} template={repoStore.template} />
		{/key}
	{:else if mode === 'rich'}
		{#key resetKey}
			<Milkdown bind:this={richEditor} value={body} onchange={(markdown) => (body = markdown)} />
		{/key}
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
		<CommitDialog
			title="Save changes"
			bind:message
			busy={saving}
			error={saveError}
			submitLabel="Submit"
			busyLabel="Saving…"
			disabled={diff.identical}
			wide
			onsubmit={commit}
			oncancel={() => (confirming = false)}
		>
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

			{#snippet errorExtra()}
				{#if conflict}
					<p>
						The file changed in the repository since it was loaded. Reload to get the latest
						version — your edits here will be lost, so copy anything you need first.
					</p>
					<button type="button" onclick={reloadFromRepo}>Reload from repository</button>
				{/if}
			{/snippet}
		</CommitDialog>
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

	.mode-toggle {
		position: relative;
		display: inline-grid;
		grid-template-columns: repeat(var(--n), 2.6rem);
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface-2);
		padding: 2px;
	}
	.mode-toggle .thumb {
		position: absolute;
		top: 2px;
		bottom: 2px;
		left: 2px;
		width: 2.6rem;
		border-radius: 999px;
		background: var(--accent);
		transform: translateX(calc(var(--i) * 2.6rem));
		transition: transform 0.18s ease;
	}
	.mode-toggle button {
		position: relative;
		width: 2.6rem;
		height: 1.9rem;
		padding: 0;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--text-dim);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.mode-toggle button:hover {
		background: transparent;
		color: var(--text);
	}
	.mode-toggle button.on {
		color: #fff;
	}
	.mode-toggle button.unavailable {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.mode-toggle button.unavailable:hover {
		color: var(--text-dim);
	}
	@media (prefers-reduced-motion: reduce) {
		.mode-toggle .thumb {
			transition: none;
		}
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
	.part.save:not(:disabled) {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
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
