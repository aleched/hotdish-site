<script lang="ts">
	import { goto } from '$app/navigation';
	import { ForgeError } from '$lib/forge/errors';
	import { serializeFrontmatter } from '$lib/markdown/frontmatter';
	import {
		commitMessages,
		fileNameError,
		folderError,
		joinPath,
		normalizeFolder,
		slugify,
		toFull,
		withMarkdownExtension
	} from '$lib/paths';
	import { repoStore } from '$lib/store/repo.svelte';
	import type { RecipeTemplate } from '$lib/template/schema';
	import CommitDialog from '$lib/ui/CommitDialog.svelte';
	import FolderPicker from '$lib/ui/FolderPicker.svelte';
	import Modal from '$lib/ui/Modal.svelte';

	interface Props {
		/** Folder (relative to the base path) preselected in the picker. */
		folderPath: string;
		src: string;
		onclose: () => void;
	}

	let { folderPath, src, onclose }: Props = $props();

	// svelte-ignore state_referenced_locally
	let folder = $state(folderPath);
	let title = $state('');
	let fileName = $state('');
	let touchedFileName = $state(false);
	let step = $state<'details' | 'commit'>('details');
	let message = $state('');
	let creating = $state(false);
	let error = $state<unknown>(null);

	let effectiveFileName = $derived(
		withMarkdownExtension(touchedFileName ? fileName.trim() : slugify(title))
	);
	let relativePath = $derived(joinPath(normalizeFolder(folder), effectiveFileName));
	let targetPath = $derived(toFull(relativePath, repoStore.basePath));
	let exists = $derived(Boolean(repoStore.entryFor(targetPath)));

	let problem = $derived.by(() => {
		if (!title.trim()) return 'A title is required.';
		return (
			folderError(folder) ??
			fileNameError(effectiveFileName) ??
			(exists ? `${targetPath} already exists.` : null)
		);
	});

	function scaffold(template: RecipeTemplate | null): string {
		const fields: Record<string, unknown> = { title: title.trim() };
		if (!template || template.fields.some((field) => field.key === 'tags')) fields.tags = [];

		const sections = (template?.sections ?? [
			{ heading: 'Ingredients', type: 'list' as const },
			{ heading: 'Instructions', type: 'ordered' as const }
		])
			.filter((section) => !('optional' in section && section.optional))
			.map((section) => `## ${section.heading}\n`)
			.join('\n');

		return serializeFrontmatter(fields, `${sections}\n`);
	}

	function next(event: SubmitEvent) {
		event.preventDefault();
		if (problem) return;
		message = commitMessages.create(title.trim());
		error = null;
		step = 'commit';
	}

	async function create() {
		const provider = repoStore.provider;
		const branch = repoStore.resolvedRef;
		if (!provider || !branch) {
			error = new Error('The repository is not loaded yet.');
			return;
		}

		creating = true;
		error = null;
		try {
			const content = scaffold(repoStore.template);
			const result = await provider.writeFile({
				path: targetPath,
				content,
				message: message.trim(),
				branch
			});

			repoStore.registerNewFile(targetPath, content, result.sha ?? `new:${targetPath}`);
			onclose();
			await goto(`/r/${src}/${encodeURI(relativePath)}?edit`);
		} catch (cause) {
			error =
				cause instanceof ForgeError && cause.kind === 'conflict'
					? new Error(`${targetPath} already exists in the repository.`)
					: cause;
		} finally {
			creating = false;
		}
	}
</script>

{#if step === 'details'}
	<Modal title="New recipe" {onclose}>
		<form class="stack" onsubmit={next}>
			<div class="field">
				<label class="label" for="new-title">Title</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input id="new-title" type="text" bind:value={title} autocomplete="off" autofocus />
			</div>

			<FolderPicker bind:value={folder} id="new-folder" />

			<div class="field">
				<label class="label" for="new-file">File name</label>
				<input
					id="new-file"
					type="text"
					value={touchedFileName ? fileName : slugify(title)}
					oninput={(event) => {
						touchedFileName = true;
						fileName = event.currentTarget.value;
					}}
					autocomplete="off"
					spellcheck="false"
				/>
				<p class="muted small">
					Will be created as <code>{effectiveFileName ? targetPath : '…'}</code>
				</p>
			</div>

			{#if exists}
				<p class="banner warn">A file already exists at that path.</p>
			{/if}

			<div class="row actions">
				<button type="button" onclick={onclose}>Cancel</button>
				<button class="primary" type="submit" disabled={Boolean(problem)}>Next</button>
			</div>
		</form>
	</Modal>
{:else}
	<CommitDialog
		title={`Create ${title.trim()}`}
		bind:message
		busy={creating}
		{error}
		submitLabel="Create"
		busyLabel="Creating…"
		onsubmit={create}
		oncancel={() => (step = 'details')}
	>
		<p class="muted small">Creates <code>{targetPath}</code> and opens it in the editor.</p>
	</CommitDialog>
{/if}

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
	.actions {
		justify-content: flex-end;
	}
</style>
