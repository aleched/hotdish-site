<script lang="ts">
	import { dumpFrontmatter, parseFrontmatter, parseYamlMapping, serializeFrontmatter } from '$lib/markdown/frontmatter';
	import type { RecipeDoc } from '$lib/markdown/recipe';
	import { renderMarkdown } from '$lib/markdown/render';
	import { repoStore } from '$lib/store/repo.svelte';
	import { structureDocument, type StructuredDoc } from '$lib/template/parse';
	import { serializeDocument } from '$lib/template/serialize';
	import StructuredForm from '$lib/ui/StructuredForm.svelte';
	import { diffLines } from '$lib/util/diff';
	import { ForgeError } from '$lib/forge/errors';
	import { commitMessages, fileNameError, folderError, baseName, joinPath, normalizeFolder, parentFolder, slugify, toFull, toRelative, withMarkdownExtension } from '$lib/paths';
	import { untrack } from 'svelte';
	import { historyStore } from '$lib/store/history.svelte';
	import { authStore } from '$lib/store/auth.svelte';
	import CommitDialog from '$lib/ui/CommitDialog.svelte';
	import { beforeNavigate } from '$app/navigation';
	import Milkdown from './Milkdown.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import LineNumberedTextarea from '$lib/ui/LineNumberedTextarea.svelte';

	type Mode = 'form' | 'rich' | 'source' | 'raw';

	interface Props {
		doc: RecipeDoc;
		/** An unsaved draft: saving creates the file, and nothing exists in the repository before. */
		isNew?: boolean;
		/** Path the file should have after saving, relative to the base path; differs when renamed. */
		targetRelative?: string;
		/** Receives the relative path to show afterwards (the new location when saved or moved). */
		onclose?: (destination?: string) => void;
	}

	let { doc, isNew = false, targetRelative = $bindable(), onclose }: Props = $props();

	// svelte-ignore state_referenced_locally
	const fromRelative = toRelative(doc.path, repoStore.basePath);
	let destination = $derived.by(() => {
		if (targetRelative === undefined) return fromRelative;
		const value = targetRelative.replace(/\\/g, '/');
		const folder = parentFolder(value);
		const name = baseName(value).trim();
		return joinPath(normalizeFolder(folder), withMarkdownExtension(name));
	});
	let moved = $derived(!isNew && destination !== fromRelative);
	let moveProblem = $derived.by(() => {
		if (!moved && !isNew) return null;
		const value = (targetRelative ?? '').replace(/\\/g, '/');
		const invalid = folderError(parentFolder(value)) ?? fileNameError(baseName(value));
		if (invalid) return invalid;
		const full = toFull(destination, repoStore.basePath);
		return repoStore.entryFor(full) ? `${full} already exists.` : null;
	});

	// A new recipe's file name follows its title until the name is edited by hand.
	// svelte-ignore state_referenced_locally
	let lastAuto = targetRelative;
	$effect(() => {
		if (!isNew) return;
		const title = typeof fields.title === 'string' ? fields.title : '';
		const current = untrack(() => targetRelative);
		if (current !== lastAuto) return;
		const folder = parentFolder((current ?? '').replace(/\\/g, '/'));
		const next = joinPath(folder, `${slugify(title) || 'new-recipe'}.md`);
		lastAuto = next;
		targetRelative = next;
	});

	/**
	 * A frontmatter block that YAML could not parse would be silently dropped by any structured
	 * edit, so those files are only ever editable as raw text.
	 */
	// The editor works on a snapshot taken at mount; the parent re-mounts it (keyed by sha) if
	// the underlying document changes.
	// svelte-ignore state_referenced_locally
	const rawOnly = Boolean(doc.frontmatterError);

	let mode = $state<Mode>(rawOnly ? 'raw' : 'form');

	const ALL_MODES: { value: Mode; label: string; icon: 'form' | 'markdown' | 'rich' | 'file' }[] = [
		{ value: 'form', label: 'Form', icon: 'form' },
		{ value: 'rich', label: 'Rich text', icon: 'rich' },
		{ value: 'source', label: 'Markdown', icon: 'markdown' },
		{ value: 'raw', label: 'Raw file', icon: 'file' }
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
	// svelte-ignore state_referenced_locally
	let fmText = $state(dumpFrontmatter(doc.fields));
	let sourceDigits = $derived(
		Math.max(String(fmText.split('\n').length).length, String(body.split('\n').length).length)
	);
	let fmError = $state<string | null>(null);
	let modeError = $state<string | null>(null);
	let structured = $state<StructuredDoc | null>(null);
	// Header-only view of the frontmatter for the rich text editor; edits go straight to `fields`.
	let richHeader = $derived<StructuredDoc>({ fields, preamble: '', sections: [] });
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
		modeError = null;
		if (fmError) {
			modeError = 'Fix the frontmatter before switching modes.';
			return;
		}
		capture();
		if (mode === 'raw') {
			const parsed = parseFrontmatter(rawText);
			if (parsed.error) {
				modeError = `Fix the frontmatter before switching modes (${parsed.error}).`;
				return;
			}
			fields = parsed.data;
			body = parsed.body;
		}
		if (next === 'raw') rawText = currentRaw;
		if (next === 'form') structured = toStructured();
		if (next === 'source' || next === 'rich') {
			fmText = dumpFrontmatter(fields);
			fmError = null;
		}
		mode = next;
	}

	function onFrontmatterInput(text: string) {
		fmText = text;
		const result = parseYamlMapping(text);
		if ('error' in result) {
			fmError = result.error;
		} else {
			fmError = null;
			fields = result.data;
		}
	}

	let currentRaw = $derived.by(() => {
		if (mode === 'raw') return rawText;
		// Touch the reactive sources so the preview and dirty state stay live.
		void structured;
		void body;
		void fields;
		if (mode === 'form' && structured) return serializeDocument(structured);
		return serializeFrontmatter(fields, body);
	});

	let rawProblem = $derived(mode === 'raw' && !rawOnly ? (parseFrontmatter(rawText).error ?? null) : null);

	let dirty = $derived(currentRaw.trim() !== doc.raw.trim());
	let diff = $derived(diffLines(isNew ? '' : doc.raw, currentRaw));

	let previewHtml = $derived.by(() => {
		if (mode !== 'source') return '';
		try {
			return renderMarkdown(body);
		} catch {
			return '';
		}
	});

	function beforeUnload(event: BeforeUnloadEvent) {
		if (!dirty && !moved) return;
		event.preventDefault();
		event.returnValue = '';
	}

	function startSave() {
		capture();
		saveError = null;
		conflict = false;
		const rawTitle = mode === 'raw' ? parseFrontmatter(rawText).data.title : fields.title;
		const title = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : doc.title;
		message = isNew
			? commitMessages.create(title)
			: moved
				? `${commitMessages.move(title, fromRelative, destination)}${dirty ? ' and update' : ''}`
				: commitMessages.update(title);
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
			let baseSha: string | undefined;
			if (!isNew) {
				// Prefer the sha the store knows about: a previous save in this session may have moved it.
				const knownSha = repoStore.entryFor(doc.path)?.sha ?? doc.sha;
				baseSha = await provider.resolveWriteBase(doc.path, branch, knownSha);
			}

			if (moved) {
				const target = toFull(destination, repoStore.basePath);
				const ref = repoStore.ref;
				const result = await provider.moveFile({
					from: doc.path,
					to: target,
					content: dirty ? content : doc.raw,
					baseSha,
					message: message.trim(),
					branch
				});
				repoStore.renameFile(doc.path, target);
				if (dirty) repoStore.applySavedDoc(target, content, result.sha);
				if (ref) void historyStore.rename($state.snapshot(ref), fromRelative, destination);
				confirming = false;
				leaving = true;
				onclose?.(destination);
				return;
			}

			const writePath = isNew ? toFull(destination, repoStore.basePath) : doc.path;
			const result = await provider.writeFile({
				path: writePath,
				content,
				baseSha,
				message: message.trim(),
				branch
			});

			if (isNew) repoStore.registerNewFile(writePath, content, result.sha ?? `new:${writePath}`);
			else repoStore.applySavedDoc(doc.path, content, result.sha);
			confirming = false;
			leaving = true;
			onclose?.(destination);
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
		fmText = dumpFrontmatter(fields);
		fmError = null;
		modeError = null;
		if (!rawOnly) structured = toStructured();
		// Re-mounts the active editor so it picks up the restored content.
		resetKey++;
	}

	function cancel() {
		if ((dirty || moved) && !window.confirm('Discard your unsaved changes?')) return;
		leaving = true;
		onclose?.();
	}

	// Guards in-app navigation (links, back button); beforeunload covers closing the tab.
	beforeNavigate((navigation) => {
		if (leaving || !(dirty || moved) || navigation.type === 'leave') return;
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
				{@const unavailable = rawOnly && item.value !== 'raw'}
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
				disabled={(!dirty && !isNew && !moved) || Boolean(moveProblem) || Boolean(fmError) || (!rawOnly && Boolean(rawProblem)) || (isNew && !String(fields.title ?? '').trim()) || saving}
				onclick={startSave}
			>
				<Icon name="save" />
			</button>
		</div>
	</header>

	{#if moveProblem}
		<p class="banner warn">{moveProblem}</p>
	{/if}

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

	{#if modeError}
		<p class="banner warn">{modeError}</p>
	{/if}

	{#if mode === 'source'}
		<div class="frontmatter">
			<LineNumberedTextarea
				rows={1}
				fit
				fractions={false}
				minDigits={sourceDigits}
				spellcheck={false}
				value={fmText}
				oninput={(event) => onFrontmatterInput(event.currentTarget.value)}
				placeholder="Frontmatter (YAML)"
				title="Frontmatter (YAML)"
				aria-label="Frontmatter (YAML)"
				aria-invalid={Boolean(fmError)}
			/>
			{#if fmError}<p class="banner warn">{fmError}</p>{/if}
		</div>
	{/if}

	{#if mode === 'form' && structured}
		{#key resetKey}
			<StructuredForm doc={structured} template={repoStore.template} />
		{/key}
	{:else if mode === 'rich'}
		<StructuredForm doc={richHeader} template={repoStore.template} headerOnly />
		{#key resetKey}
			<Milkdown bind:this={richEditor} value={body} onchange={(markdown) => (body = markdown)} />
		{/key}
	{:else if mode === 'raw'}
		<LineNumberedTextarea
			rows={1}
			fit
			fractions={false}
			spellcheck={false}
			bind:value={rawText}
			aria-label="Raw file"
		/>
		{#if rawProblem}<p class="banner warn">{rawProblem}</p>{/if}
	{:else}
		<div class="source">
			<LineNumberedTextarea
				rows={3}
				fit
				minDigits={sourceDigits}
				spellcheck={false}
				bind:value={body}
				aria-label="Markdown source"
			/>
			{#if previewHtml}
				<div class="prose preview">{@html previewHtml}</div>
			{/if}
		</div>
	{/if}

	{#if confirming}
		<CommitDialog
			title={isNew ? 'Create recipe' : 'Save changes'}
			bind:message
			busy={saving}
			error={saveError}
			submitLabel="Save"
			submitIcon="save"
			disabled={diff.identical && !isNew && !moved}
			wide
			onsubmit={commit}
			oncancel={() => (confirming = false)}
		>
			{#if moved}
				<p class="muted small">
					Moves <code>{doc.path}</code> to <code>{toFull(destination, repoStore.basePath)}</code>
				</p>
			{/if}
			{#if diff.identical}
				{#if !moved}<p class="muted">No changes to save.</p>{/if}
			{:else}
				<p class="muted small">
					+{diff.added} line(s), −{diff.removed} line(s) in
					<code>{isNew ? toFull(destination, repoStore.basePath) : doc.path}</code>
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
					<button
						type="button"
						class="icon-button dialog-button"
						title="Reload from repository"
						aria-label="Reload from repository"
						onclick={reloadFromRepo}
					>
						<Icon name="refresh" />
					</button>
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
