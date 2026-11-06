<script lang="ts">
	import { dumpFrontmatter, parseFrontmatter, parseYamlMapping, serializeFrontmatter } from '$lib/markdown/frontmatter';
	import type { Doc } from '$lib/markdown/doc';
	import { renderMarkdown } from '$lib/markdown/render';
	import { repoStore } from '$lib/store/repo.svelte';
	import { structureDocument, type StructuredDoc } from '$lib/template/parse';
	import { serializeDocument } from '$lib/template/serialize';
	import StructuredForm from '$lib/ui/StructuredForm.svelte';
	import { diffLines } from '$lib/util/diff';
	import { ForgeError } from '$lib/forge/errors';
	import { commitMessages, fileNameError, folderError, baseName, joinPath, normalizeFolder, parentFolder, slugify, toFull, toRelative, withMarkdownExtension } from '$lib/paths';
	import { onMount, untrack } from 'svelte';
	import { deleteDraft, draftKey, readDraft, writeDraft, type Draft } from '$lib/cache/drafts';
	import { snapshotKey } from '$lib/cache/repoCache';
	import { connectionStore } from '$lib/store/connection.svelte';
	import { editorOpened } from '$lib/pwa/update';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { historyStore } from '$lib/store/history.svelte';
	import CommitDialog from '$lib/ui/CommitDialog.svelte';
	import { beforeNavigate } from '$app/navigation';
	import Milkdown from './Milkdown.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import LineNumberedTextarea from '$lib/ui/LineNumberedTextarea.svelte';

	import ModeToggle from '$lib/ui/ModeToggle.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { editorPrefs, EDITOR_MODES, type EditorMode } from '$lib/store/editorPrefs.svelte';

	type Mode = EditorMode;

	function escapeHtml(text: string): string {
		return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
	}

	interface Props {
		doc: Doc;
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
		return repoStore.entryFor(full) ? m.editor_already_exists({ path: full }) : null;
	});

	// A new document's file name follows its title until the name is edited by hand.
	// svelte-ignore state_referenced_locally
	let lastAuto = targetRelative;
	$effect(() => {
		if (!isNew) return;
		const title = typeof fields.title === 'string' ? fields.title : '';
		const current = untrack(() => targetRelative);
		if (current !== lastAuto) return;
		const folder = parentFolder((current ?? '').replace(/\\/g, '/'));
		const next = joinPath(folder, `${slugify(title) || 'new-doc'}.md`);
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

	let mode = $state<Mode>(rawOnly ? 'raw' : editorPrefs.defaultMode);

	const modes = EDITOR_MODES;
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
			modeError = m.editor_fix_frontmatter();
			return;
		}
		capture();
		if (mode === 'raw') {
			const parsed = parseFrontmatter(rawText);
			if (parsed.error) {
				modeError = m.editor_fix_frontmatter_detail({ error: parsed.error });
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

	// Work in progress is kept on the device, so a lost connection, reload or closed app never
	// loses it. A new document has one pending draft per repository.
	// svelte-ignore state_referenced_locally
	const draftId = repoStore.ref ? draftKey(snapshotKey(repoStore.ref), isNew ? null : doc.path) : null;
	// svelte-ignore state_referenced_locally
	const initialTarget = targetRelative;
	let draftChecked = $state(false);
	let restored = $state<{ savedAt: number; changed: boolean } | null>(null);

	function loadContent(raw: string) {
		const parsed = parseFrontmatter(raw);
		rawText = raw;
		if (rawOnly || parsed.error) {
			mode = 'raw';
		} else {
			fields = parsed.data;
			body = parsed.body;
			fmText = dumpFrontmatter(fields);
			structured = toStructured();
		}
		fmError = null;
		modeError = null;
		resetKey++;
	}

	function restoreDraft(saved: Draft) {
		loadContent(saved.raw);
		if (isNew && saved.targetRelative) {
			const title = typeof fields.title === 'string' ? fields.title : '';
			const auto = joinPath(parentFolder(saved.targetRelative), `${slugify(title) || 'new-doc'}.md`);
			// Keep the name following the title only if it did so when the draft was saved.
			lastAuto = saved.targetRelative === auto ? auto : undefined;
			targetRelative = saved.targetRelative;
		}
		restored = { savedAt: saved.savedAt, changed: saved.baseSha !== doc.sha };
	}

	function forgetDraft() {
		if (draftId) void deleteDraft(draftId);
	}

	function discardDraft() {
		forgetDraft();
		restored = null;
		loadContent(doc.raw);
		if (isNew) {
			lastAuto = initialTarget;
			targetRelative = initialTarget;
		}
	}

	onMount(() => {
		const release = editorOpened();
		void (async () => {
			const saved = draftId ? await readDraft(draftId) : undefined;
			if (!leaving && saved && saved.raw.trim() !== doc.raw.trim()) restoreDraft(saved);
			draftChecked = true;
		})();
		return release;
	});

	$effect(() => {
		if (!draftChecked || !draftId) return;
		const raw = currentRaw;
		const keep = dirty || (isNew && targetRelative !== initialTarget);
		const target = targetRelative;
		const timer = setTimeout(() => {
			if (leaving) return;
			if (keep) {
				void writeDraft(draftId, {
					raw,
					mode,
					targetRelative: isNew ? target : undefined,
					baseSha: doc.sha,
					savedAt: Date.now()
				});
			} else {
				forgetDraft();
			}
		}, 800);
		return () => clearTimeout(timer);
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
			saveError = new Error(m.error_repo_not_loaded());
			return;
		}

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
				forgetDraft();
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
			forgetDraft();
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
		if (!window.confirm(m.confirm_discard())) return;
		fields = $state.snapshot(doc.fields);
		body = doc.body;
		rawText = doc.raw;
		fmText = dumpFrontmatter(fields);
		fmError = null;
		modeError = null;
		if (!rawOnly) structured = toStructured();
		// Re-mounts the active editor so it picks up the restored content.
		resetKey++;
		restored = null;
		forgetDraft();
	}

	function cancel() {
		if ((dirty || moved) && !window.confirm(m.confirm_discard())) return;
		leaving = true;
		forgetDraft();
		onclose?.();
	}

	// Guards in-app navigation (links, back button); beforeunload covers closing the tab.
	beforeNavigate((navigation) => {
		if (leaving || !(dirty || moved) || navigation.type === 'leave') return;
		if (!window.confirm(m.confirm_discard())) navigation.cancel();
		else forgetDraft();
	});
</script>

<svelte:window onbeforeunload={beforeUnload} />

<div class="editor stack">
	<header class="bar">
		<ModeToggle
			items={modes}
			value={mode}
			label={m.editor_mode_label()}
			onselect={setMode}
			unavailable={(value) =>
				rawOnly && value !== 'raw' ? m.editor_unparsable_reason() : null}
		/>

		<div class="split">
			{#if dirty}
				<button
					type="button"
					class="part"
					title={m.editor_undo()}
					aria-label={m.editor_undo()}
					disabled={saving}
					onclick={undo}
				>
					<Icon name="undo" />
				</button>
			{/if}
			<button
				type="button"
				class="part"
				title={m.common_cancel()}
				aria-label={m.common_cancel()}
				onclick={cancel}
			>
				<Icon name="cancel" />
			</button>
			<button
				class="part save"
				type="button"
				title={connectionStore.online ? m.common_save() : m.offline_unavailable()}
				aria-label={m.common_save()}
				disabled={!connectionStore.online || (!dirty && !isNew && !moved) || Boolean(moveProblem) || Boolean(fmError) || (!rawOnly && Boolean(rawProblem)) || (isNew && !String(fields.title ?? '').trim()) || saving}
				onclick={startSave}
			>
				<Icon name="save" />
			</button>
		</div>
	</header>

	{#if restored}
		<p class="banner draft" class:warn={restored.changed}>
			<span>
				{m.draft_restored({ time: new Date(restored.savedAt).toLocaleString(getLocale()) })}
				{#if restored.changed}{m.draft_changed()}{/if}
			</span>
			<button type="button" class="ghost" onclick={discardDraft}>{m.draft_discard()}</button>
		</p>
	{/if}

	{#if moveProblem}
		<p class="banner warn">{moveProblem}</p>
	{/if}

	{#if rawOnly}
		<p class="banner warn">
			{m.editor_raw_only({ error: doc.frontmatterError ?? '' })}
		</p>
	{/if}

	{#if repoStore.template && !repoStore.templateIsDefault && !rawOnly}
		<p class="muted small">
			{@html m.editor_using_template({ name: `<strong>${escapeHtml(repoStore.template.name)}</strong>` })}
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
				placeholder={m.editor_frontmatter()}
				title={m.editor_frontmatter()}
				aria-label={m.editor_frontmatter()}
				aria-invalid={Boolean(fmError)}
			/>
			{#if fmError}<p class="banner warn">{fmError}</p>{/if}
		</div>
	{/if}

	{#if mode === 'form' && structured}
		{#key resetKey}
			<StructuredForm doc={structured} template={repoStore.template} path={isNew ? null : doc.path} />
		{/key}
	{:else if mode === 'rich'}
		<StructuredForm doc={richHeader} template={repoStore.template} path={isNew ? null : doc.path} headerOnly />
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
			aria-label={m.editor_raw_file()}
		/>
		{#if rawProblem}<p class="banner warn">{rawProblem}</p>{/if}
	{:else}
		<div class="source">
			<LineNumberedTextarea
				rows={3}
				fit
				minDigits={sourceDigits}
				spellcheck={editorPrefs.spellcheck}
				bind:value={body}
				aria-label={m.editor_markdown_source()}
			/>
			{#if previewHtml}
				<div class="prose preview">{@html previewHtml}</div>
			{/if}
		</div>
	{/if}

	{#if confirming}
		<CommitDialog
			title={isNew ? m.editor_create_doc() : m.editor_save_changes()}
			bind:message
			busy={saving}
			error={saveError}
			submitLabel={m.common_save()}
			submitIcon="save"
			disabled={diff.identical && !isNew && !moved}
			wide
			onsubmit={commit}
			oncancel={() => (confirming = false)}
		>
			{#if moved}
				<p class="muted small">
					{@html m.editor_moves({ from: `<code>${escapeHtml(doc.path)}</code>`, to: `<code>${escapeHtml(toFull(destination, repoStore.basePath))}</code>` })}
				</p>
			{/if}
			{#if diff.identical}
				{#if !moved}<p class="muted" title={m.editor_no_changes()} aria-label={m.editor_no_changes()}><Icon name="check" /></p>{/if}
			{:else}
				<p class="muted small">
					{@html m.editor_diff_summary({ added: diff.added, removed: diff.removed, path: `<code>${escapeHtml(isNew ? toFull(destination, repoStore.basePath) : doc.path)}</code>` })}
				</p>
				<pre class="diff">{#each diff.lines as line, index (index)}<span class={line.kind}
						>{line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}{line.text}</span
					>{'\n'}{/each}</pre>
			{/if}

			{#snippet errorExtra()}
				{#if conflict}
					<p>{m.editor_conflict()}</p>
					<button
						type="button"
						class="icon-button dialog-button"
						title={m.editor_reload()}
						aria-label={m.editor_reload()}
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
	.banner.draft {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.banner.draft button {
		flex-shrink: 0;
		color: inherit;
	}

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
