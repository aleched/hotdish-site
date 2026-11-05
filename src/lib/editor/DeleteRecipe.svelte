<script lang="ts">
	import { goto } from '$app/navigation';
	import type { RecipeDoc } from '$lib/markdown/recipe';
	import { commitMessages, parentFolder, toRelative } from '$lib/paths';
	import { historyStore } from '$lib/store/history.svelte';
	import { repoStore } from '$lib/store/repo.svelte';
	import CommitDialog from '$lib/ui/CommitDialog.svelte';

	interface Props {
		doc: RecipeDoc;
		src: string;
		onclose: () => void;
	}

	let { doc, src, onclose }: Props = $props();

	// svelte-ignore state_referenced_locally
	let message = $state(commitMessages.delete(doc.title));
	let deleting = $state(false);
	let error = $state<unknown>(null);

	async function remove() {
		const provider = repoStore.provider;
		const branch = repoStore.resolvedRef;
		const ref = repoStore.ref;
		if (!provider || !branch || !ref) {
			error = new Error('The repository is not loaded.');
			return;
		}

		deleting = true;
		error = null;
		try {
			const knownSha = repoStore.entryFor(doc.path)?.sha ?? doc.sha;
			const baseSha = await provider.resolveWriteBase(doc.path, branch, knownSha);
			await provider.deleteFile({ path: doc.path, baseSha, message: message.trim(), branch });

			const relative = toRelative(doc.path, repoStore.basePath);
			repoStore.removeFile(doc.path);
			void historyStore.forget($state.snapshot(ref), relative);
			onclose();

			// Git has no empty folders, so walk up past any folder this delete emptied.
			let folder = parentFolder(relative);
			while (folder && !repoStore.folders.some((item) => item.path === folder)) {
				folder = parentFolder(folder);
			}
			await goto(folder ? `/r/${src}/${encodeURI(folder)}` : `/r/${src}`);
		} catch (cause) {
			error = cause;
		} finally {
			deleting = false;
		}
	}
</script>

<CommitDialog
	title={`Delete ${doc.title}?`}
	bind:message
	busy={deleting}
	{error}
	danger
	submitLabel="Delete"
	submitIcon="trash"
	onsubmit={remove}
	oncancel={onclose}
>
	<p class="banner warn">
		This removes <code>{doc.path}</code> from the branch. It can still be recovered from the
		repository's commit history.
	</p>
</CommitDialog>
