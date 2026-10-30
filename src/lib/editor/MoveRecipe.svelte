<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import type { RecipeDoc } from '$lib/markdown/recipe';
	import {
		baseName,
		commitMessages,
		fileNameError,
		folderError,
		joinPath,
		normalizeFolder,
		parentFolder,
		toFull,
		toRelative,
		withMarkdownExtension
	} from '$lib/paths';
	import { historyStore } from '$lib/store/history.svelte';
	import { repoStore } from '$lib/store/repo.svelte';
	import CommitDialog from '$lib/ui/CommitDialog.svelte';
	import FolderPicker from '$lib/ui/FolderPicker.svelte';

	interface Props {
		doc: RecipeDoc;
		src: string;
		onclose: () => void;
	}

	let { doc, src, onclose }: Props = $props();

	// The dialog works on a snapshot of the recipe taken when it opens.
	// svelte-ignore state_referenced_locally
	const fromRelative = toRelative(doc.path, repoStore.basePath);

	let folder = $state(parentFolder(fromRelative));
	let fileName = $state(baseName(fromRelative));
	let message = $state('');
	let moving = $state(false);
	let error = $state<unknown>(null);

	let toRelativePath = $derived(
		joinPath(normalizeFolder(folder), withMarkdownExtension(fileName.trim()))
	);
	let targetPath = $derived(toFull(toRelativePath, repoStore.basePath));

	let problem = $derived.by(() => {
		const invalid = folderError(folder) ?? fileNameError(fileName);
		if (invalid) return invalid;
		if (toRelativePath === fromRelative) return 'Choose a different folder or file name.';
		if (repoStore.entryFor(targetPath)) return `${targetPath} already exists.`;
		return null;
	});

	let suggested = $derived(commitMessages.move(doc.title, fromRelative, toRelativePath));
	let lastSuggested = '';

	// Follow the destination in the prefilled message until the user edits it themselves.
	$effect(() => {
		const next = suggested;
		if (untrack(() => message) === lastSuggested) message = next;
		lastSuggested = next;
	});

	async function move() {
		const provider = repoStore.provider;
		const branch = repoStore.resolvedRef;
		const ref = repoStore.ref;
		if (!provider || !branch || !ref) {
			error = new Error('The repository is not loaded.');
			return;
		}
		if (problem) return;

		moving = true;
		error = null;
		try {
			const knownSha = repoStore.entryFor(doc.path)?.sha ?? doc.sha;
			const baseSha = await provider.resolveWriteBase(doc.path, branch, knownSha);
			await provider.moveFile({
				from: doc.path,
				to: targetPath,
				content: doc.raw,
				baseSha,
				message: message.trim(),
				branch
			});

			const destination = toRelativePath;
			repoStore.renameFile(doc.path, targetPath);
			void historyStore.rename($state.snapshot(ref), fromRelative, destination);
			onclose();
			await goto(`/r/${src}/${encodeURI(destination)}`);
		} catch (cause) {
			error = cause;
		} finally {
			moving = false;
		}
	}
</script>

<CommitDialog
	title={`Move ${doc.title}`}
	bind:message
	busy={moving}
	{error}
	disabled={Boolean(problem)}
	autofocusMessage={false}
	submitLabel="Move"
	busyLabel="Moving…"
	onsubmit={move}
	oncancel={onclose}
>
	<p class="muted small">Currently at <code>{doc.path}</code></p>

	<FolderPicker bind:value={folder} id="move-folder" label="Destination folder" />

	<div class="field">
		<label class="label" for="move-file">File name</label>
		<input id="move-file" type="text" bind:value={fileName} autocomplete="off" spellcheck="false" />
		{#if problem}
			<p class="small error">{problem}</p>
		{:else}
			<p class="muted small">Will be moved to <code>{targetPath}</code></p>
		{/if}
	</div>
</CommitDialog>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.label {
		font-size: 0.85rem;
		font-weight: 600;
	}
	.small {
		font-size: 0.78rem;
		margin: 0;
	}
	.error {
		color: var(--danger);
	}
</style>
