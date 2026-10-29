<script lang="ts">
	import { goto } from '$app/navigation';
	import { ForgeError, describeForgeError } from '$lib/forge/errors';
	import { serializeFrontmatter } from '$lib/markdown/frontmatter';
	import { repoStore } from '$lib/store/repo.svelte';
	import type { RecipeTemplate } from '$lib/template/schema';

	interface Props {
		/** Tree-relative folder the recipe is created in. */
		folderPath: string;
		src: string;
		onclose?: () => void;
	}

	let { folderPath, src, onclose }: Props = $props();

	let title = $state('');
	let fileName = $state('');
	let touchedFileName = $state(false);
	let creating = $state(false);
	let error = $state<{ message: string; hint?: string } | null>(null);

	let effectiveFileName = $derived(touchedFileName ? fileName : slugify(title));

	let targetPath = $derived.by(() => {
		const base = repoStore.basePath.replace(/\/+$/, '');
		const parts = [base, folderPath, withExtension(effectiveFileName)].filter(Boolean);
		return parts.join('/');
	});

	let exists = $derived(Boolean(repoStore.entryFor(targetPath)));

	function slugify(value: string): string {
		return value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');
	}

	function withExtension(name: string): string {
		if (!name) return '';
		return /\.(md|markdown)$/i.test(name) ? name : `${name}.md`;
	}

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

	async function create(event: SubmitEvent) {
		event.preventDefault();
		error = null;

		const provider = repoStore.provider;
		const branch = repoStore.resolvedRef;
		if (!provider || !branch) {
			error = { message: 'The repository is not loaded yet.' };
			return;
		}
		if (!provider.authenticated) {
			error = {
				message: 'An access token with write permission is required to create recipes.',
				hint: 'Add one in Settings for this repository.'
			};
			return;
		}
		if (!title.trim() || !effectiveFileName) {
			error = { message: 'A title is required.' };
			return;
		}
		if (exists) {
			error = { message: `${targetPath} already exists.` };
			return;
		}

		creating = true;
		try {
			const content = scaffold(repoStore.template);
			const result = await provider.writeFile({
				path: targetPath,
				content,
				message: `Add ${title.trim()}`,
				branch
			});

			repoStore.registerNewFile(targetPath, content, result.sha ?? `new:${targetPath}`);

			const relative = folderPath
				? `${folderPath}/${withExtension(effectiveFileName)}`
				: withExtension(effectiveFileName);
			onclose?.();
			await goto(`/r/${src}/${encodeURI(relative)}?edit`);
		} catch (cause) {
			error = describeForgeError(cause);
			if (cause instanceof ForgeError && cause.kind === 'conflict') {
				error = { message: `${targetPath} already exists in the repository.` };
			}
		} finally {
			creating = false;
		}
	}
</script>

<form class="card stack" onsubmit={create}>
	<h2>New recipe</h2>

	<div class="field">
		<label class="label" for="new-title">Title</label>
		<input id="new-title" type="text" bind:value={title} autocomplete="off" />
	</div>

	<div class="field">
		<label class="label" for="new-file">File name</label>
		<input
			id="new-file"
			type="text"
			value={effectiveFileName}
			oninput={(event) => {
				touchedFileName = true;
				fileName = event.currentTarget.value;
			}}
			autocomplete="off"
			spellcheck="false"
		/>
		<p class="muted small">
			Will be created as <code>{targetPath || '…'}</code>
		</p>
	</div>

	{#if exists}
		<p class="banner warn">A file already exists at that path.</p>
	{/if}

	{#if error}
		<div class="banner error">
			<p><strong>{error.message}</strong></p>
			{#if error.hint}<p>{error.hint}</p>{/if}
		</div>
	{/if}

	<div class="row">
		<button class="primary" type="submit" disabled={creating || !title.trim() || exists}>
			{creating ? 'Creating…' : 'Create and edit'}
		</button>
		<button type="button" onclick={() => onclose?.()}>Cancel</button>
	</div>
</form>

<style>
	h2 {
		font-size: 0.95rem;
		margin: 0;
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
	.small {
		font-size: 0.78rem;
		margin: 0;
	}
</style>
