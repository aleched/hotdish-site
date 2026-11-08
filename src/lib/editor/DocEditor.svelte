<script lang="ts">
	import { dumpFrontmatter, parseFrontmatter, parseYamlMapping, serializeFrontmatter } from '#lib/markdown/frontmatter.ts';
	import type { Doc } from '#lib/markdown/doc.ts';
	import { renderMarkdown } from '#lib/markdown/render.ts';
	import { repoStore } from '#lib/store/repo.svelte.ts';
	import { structureDocument, type StructuredDoc } from '#lib/template/parse.ts';
	import { serializeDocument } from '#lib/template/serialize.ts';
	import StructuredForm from '#lib/ui/StructuredForm.svelte';
	import { fileNameError, folderError, baseName, joinPath, normalizeFolder, parentFolder, slugify, toFull, toRelative, withMarkdownExtension } from '#lib/paths.ts';
	import { onMount, untrack } from 'svelte';
	import { deleteDraft, draftKey, readDraft, writeDraft, type Draft } from '#lib/cache/drafts.ts';
	import { snapshotKey } from '#lib/cache/repoCache.ts';
	import { editorOpened } from '#lib/pwa/update.ts';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { historyStore } from '#lib/store/history.svelte.ts';
	import { beforeNavigate } from '$app/navigation';
	import Milkdown from './Milkdown.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import LineNumberedTextarea from '#lib/ui/LineNumberedTextarea.svelte';

	import ModeToggle from '#lib/ui/ModeToggle.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { editorPrefs, EDITOR_MODES, type EditorMode } from '#lib/store/editorPrefs.svelte.ts';

	type Mode = EditorMode;

	interface Props {
		doc: Doc;
		/** An unsaved draft: saving creates the file, and nothing exists in the repository before. */
		isNew?: boolean;
		/** Path the file should have after saving, relative to the base path; differs when renamed. */
		targetRelative?: string;
		/** Receives the relative path to show afterwards (the new location when saved or moved). */
		onclose?: (destination?: string) => void;
		/** Marks the file for deletion; saving then stages the delete instead of an edit. */
		deleting?: boolean;
	}

	let { doc, isNew = false, targetRelative = $bindable(), onclose, deleting = $bindable(false) }: Props = $props();

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

	let rawProblem = $derived(mode === 'raw' && !rawOnly ? parseFrontmatter(rawText).error ?? null : null);

	let dirty = $derived(currentRaw.trim() !== doc.raw.trim());

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
		const keep = dirty || isNew && targetRelative !== initialTarget;
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
		if (!dirty && !moved && !deleting) return;
		event.preventDefault();
		event.returnValue = '';
	}

	async function save() {
		if (deleting) return remove();
		capture();
		saveError = null;
		saving = true;
		try {
			const content = currentRaw.endsWith('\n') ? currentRaw : `${currentRaw}\n`;
			const target = toFull(destination, repoStore.basePath);
			if (isNew) {
				await repoStore.stageAdd(target, content);
			} else if (moved) {
				const ref = repoStore.ref;
				await repoStore.stageMove(doc.path, target, dirty ? content : doc.raw);
				if (ref) void historyStore.rename($state.snapshot(ref), fromRelative, destination);
			} else {
				await repoStore.stageEdit(doc.path, content);
			}
			leaving = true;
			forgetDraft();
			onclose?.(destination);
		} catch (error) {
			saveError = error;
		} finally {
			saving = false;
		}
	}

	async function remove() {
		saveError = null;
		saving = true;
		try {
			const ref = repoStore.ref;
			await repoStore.stageDelete(doc.path);
			if (ref) void historyStore.forget($state.snapshot(ref), fromRelative);
			leaving = true;
			forgetDraft();
			// Git has no empty folders, so walk up past any folder this delete emptied.
			let folder = parentFolder(fromRelative);
			while (folder && !repoStore.folders.some((item) => item.path === folder)) {
				folder = parentFolder(folder);
			}
			onclose?.(folder);
		} catch (error) {
			saveError = error;
		} finally {
			saving = false;
		}
	}

	function undo() {
		if (deleting) {
			deleting = false;
			return;
		}
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
		if ((dirty || moved || deleting) && !window.confirm(m.confirm_discard())) return;
		leaving = true;
		forgetDraft();
		onclose?.();
	}

	// Guards in-app navigation (links, back button); beforeunload covers closing the tab.
	beforeNavigate((navigation) => {
		if (navigation.shallow && navigation.type === 'goto') return;
		if (leaving || !(dirty || moved || deleting) || navigation.type === 'leave') return;
		if (!window.confirm(m.confirm_discard())) navigation.cancel();
		else forgetDraft();
	});
</script>

<svelte:window onbeforeunload={beforeUnload}></svelte:window>

<div class="editor stack">
	<header class="bar">
		{#if deleting}
			<p class="deleted" title={m.editor_deleting()}>
				<Icon name="trash" size={18} />
				<code>{doc.path}</code>
			</p>
		{:else}
			<ModeToggle
				items={modes}
				value={mode}
				label={m.editor_mode_label()}
				onselect={setMode}
				unavailable={(value) =>
					rawOnly && value !== 'raw' ? m.editor_unparsable_reason() : null}
			/>
		{/if}

		<div class="split">
			{#if dirty || deleting}
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
				title={m.common_save()}
				aria-label={m.common_save()}
				disabled={saving || !deleting && (!dirty && !isNew && !moved || Boolean(moveProblem) || Boolean(fmError) || !rawOnly && Boolean(rawProblem) || isNew && !String(fields.title ?? '').trim())}
				onclick={save}
			>
				<Icon name="save" />
			</button>
		</div>
	</header>

	{#if !deleting}
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
				{m.editor_using_template()}{#if repoStore.template.name}
					<strong>{repoStore.template.name}</strong>
				{/if}
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
				<Milkdown
					bind:this={richEditor}
					value={body}
					onchange={(markdown) => body = markdown}
				/>
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
	{/if}

	{#if saveError}
		<p class="banner warn" role="alert">{saveError instanceof Error ? saveError.message : String(saveError)}</p>
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
	.deleted {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		width: fit-content;
		max-width: 100%;
		margin: 0;
		padding: 0.4rem 0.7rem;
		border: 1px solid var(--danger);
		border-radius: var(--radius-sm);
		color: var(--danger);
		overflow-wrap: anywhere;
	}
	.deleted code {
		color: var(--text);
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
