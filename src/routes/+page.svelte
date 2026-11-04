<script lang="ts">
	import { goto } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import { FORGE_LABELS, TOKEN_GUIDANCE } from '$lib/forge/factory';
	import { detectForgeKind } from '$lib/forge/detect';
	import { knownForgeKind, parseRepoInput } from '$lib/forge/parse';
	import type { ForgeKind, RepoRef } from '$lib/forge/types';
	import { encodeSrc } from '$lib/share/codec';
	import { profileStore, profileToRef, type Profile } from '$lib/store/profiles.svelte';
	import Icon from '$lib/ui/Icon.svelte';

	const kinds: ForgeKind[] = ['github', 'gitlab', 'gitea'];
	let isMounted = true;
	onDestroy(() => {
		isMounted = false;
	});

	let isCreating = $state(false);
	let editingId = $state<string | null>(null);
	let dragId = $state<string | null>(null);
	let overId = $state<string | null>(null);
	let input = $state('');
	let name = $state('');
	let kind = $state<ForgeKind | ''>('');
	let needsForgeChoice = $state(false);
	let isDetectingForge = $state(false);
	let gitRef = $state('');
	let basePath = $state('');
	let token = $state('');
	let error = $state<string | null>(null);
	let baseline = '';

	const formSnapshot = () => JSON.stringify([input, name, kind, gitRef, basePath, token]);
	let formDirty = $derived(formSnapshot() !== baseline);

	function undoForm() {
		if (!window.confirm('Discard your unsaved changes?')) return;
		[input, name, kind, gitRef, basePath, token] = JSON.parse(baseline);
		needsForgeChoice = false;
		error = null;
	}

	function startCreate() {
		isCreating = true;
		editingId = null;
		input = '';
		name = '';
		kind = '';
		needsForgeChoice = false;
		gitRef = '';
		basePath = '';
		token = '';
		error = null;
		baseline = formSnapshot();
	}

	function startEdit(profile: Profile) {
		isCreating = false;
		editingId = profile.id;
		input = `https://${profile.host}/${profile.owner}/${profile.repo}`;
		name = profile.name;
		kind = profile.kind;
		needsForgeChoice = false;
		gitRef = profile.ref ?? '';
		basePath = profile.basePath ?? '';
		token = profile.token ?? '';
		error = null;
		baseline = formSnapshot();
	}

	function cancelEdit() {
		isCreating = false;
		editingId = null;
		error = null;
	}

	function onInput() {
		kind = '';
		needsForgeChoice = false;
		error = null;
	}

	/** Parses the form into a repo reference, applying the optional overrides. */
	async function buildRef(): Promise<RepoRef | null> {
		error = null;
		try {
			if (!/^https?:\/\//i.test(input.trim())) {
				throw new Error('Enter a full repository URL so its host and forge can be detected.');
			}
			const parsed = parseRepoInput(input);
			let forge: ForgeKind | null | undefined = knownForgeKind(parsed.host) ?? (kind || null);
			if (!forge) {
				isDetectingForge = true;
				try {
					forge = await detectForgeKind(parsed.host);
				} finally {
					if (isMounted) isDetectingForge = false;
				}
				if (!isMounted) return null;
			}
			if (!forge) {
				needsForgeChoice = true;
				error =
					'Could not identify this forge automatically. Select its type; self-hosted APIs may block browser detection.';
				return null;
			}
			needsForgeChoice = false;
			kind = forge;
			const identified = parseRepoInput(input, { fallbackKind: forge });
			return {
				...identified,
				ref: gitRef.trim() || identified.ref,
				basePath: basePath.trim().replace(/^\/+|\/+$/g, '') || identified.basePath
			};
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
			return null;
		}
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		const ref = await buildRef();
		if (!ref) return;
		const wasCreating = isCreating;
		const profile = profileStore.save({
			id: editingId ?? undefined,
			name: name.trim() || `${ref.owner}/${ref.repo}`,
			kind: ref.kind,
			host: ref.host,
			owner: ref.owner,
			repo: ref.repo,
			ref: ref.ref || undefined,
			basePath: ref.basePath || undefined,
			token: token.trim() || undefined
		});
		if (wasCreating) await goto(`/r/${encodeSrc(profileToRef(profile))}`);
		else cancelEdit();
	}

	function onDragStart(event: DragEvent, id: string) {
		dragId = id;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', id);
		}
	}

	function onDragOver(event: DragEvent, id: string) {
		if (!dragId) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		overId = id;
	}

	function onDrop(event: DragEvent, id: string) {
		event.preventDefault();
		if (dragId && dragId !== id) {
			const to = profileStore.profiles.findIndex((profile) => profile.id === id);
			if (to !== -1) profileStore.move(dragId, to);
		}
		onDragEnd();
	}

	function onDragEnd() {
		dragId = null;
		overId = null;
	}

	let confirming = $state<{ id: string; action: 'delete' | 'token' } | null>(null);

	function runConfirmed(profile: Profile) {
		if (confirming?.action === 'delete') profileStore.remove(profile.id);
		else if (confirming?.action === 'token') profileStore.clearToken(profile.id);
		confirming = null;
	}

	function onGripKey(event: KeyboardEvent, id: string, index: number) {
		if (event.key === 'ArrowUp') profileStore.move(id, index - 1);
		else if (event.key === 'ArrowDown') profileStore.move(id, index + 1);
		else return;
		event.preventDefault();
		requestAnimationFrame(() =>
			document.querySelector<HTMLElement>(`[data-grip="${id}"]`)?.focus()
		);
	}
</script>

<svelte:head>
	<title>Hotdish — recipes from any git repository</title>
</svelte:head>

{#snippet editForm()}
				<form onsubmit={save} class="form inline-form">
					<div class="url-row">
						<div class="field url-field">
							<div class="input-icon" title="Repository URL (required)">
								<Icon name="link" />
								<input
									id="input"
									type="text"
									aria-label="Repository URL"
									aria-required="true"
									bind:value={input}
									placeholder="https://github.com/alice/recipes"
									autocomplete="off"
									spellcheck="false"
									disabled={isDetectingForge}
									oninput={onInput}
								/>
							</div>
						</div>
						<div class="split">
							{#if formDirty}
								<button
									type="button"
									class="part"
									title="Discard changes"
									aria-label="Discard changes"
									disabled={isDetectingForge}
									onclick={undoForm}
								>
									<Icon name="undo" />
								</button>
							{/if}
							<button
								type="button"
								class="part"
								title="Cancel"
								aria-label="Cancel"
								disabled={isDetectingForge}
								onclick={cancelEdit}
							>
								<Icon name="cancel" />
							</button>
							<button
								class="part save"
								type="submit"
								title={isDetectingForge ? 'Detecting forge...' : isCreating ? 'Save and open' : 'Save changes'}
								aria-label={isCreating ? 'Save and open' : 'Save changes'}
								disabled={!input.trim() || isDetectingForge || (needsForgeChoice && !kind)}
							>
								<Icon name="save" />
							</button>
						</div>
					</div>

					<div class="grid profile-fields">
						<div class="input-icon" title="Name">
							<Icon name="repos" />
							<input id="name" type="text" aria-label="Name" bind:value={name} placeholder="Name (My recipes)" />
						</div>
						<div class="input-icon" title="Branch">
							<Icon name="branch" />
							<input id="ref" type="text" aria-label="Branch" bind:value={gitRef} placeholder="main" />
						</div>
						<div class="input-icon" title="Sub-folder">
							<Icon name="folder" />
							<input id="base" type="text" aria-label="Sub-folder" bind:value={basePath} placeholder="recipes" />
						</div>
					</div>

					<div class="input-icon" title="Access token">
						<Icon name="key" />
						<input
							id="token"
							type="password"
							aria-label="Access token"
							bind:value={token}
							placeholder={kind ? TOKEN_GUIDANCE[kind] : 'Optional. Needed for private repositories and saving changes'}
							autocomplete="off"
							spellcheck="false"
						/>
					</div>
					{#if needsForgeChoice}
						<div class="field">
							<select id="kind" aria-label="Forge type" bind:value={kind}>
								<option value="">Select forge type</option>
								{#each kinds as option (option)}
									<option value={option}>{FORGE_LABELS[option]}</option>
								{/each}
							</select>
						</div>
					{/if}
					{#if error}<p class="banner error" role="alert">{error}</p>{/if}
				</form>
{/snippet}

<section class="panel">
	<div class="section-heading">
		<h2 title="Saved repositories">
			<Icon name="repos" size={20} /><span class="visually-hidden">Saved repositories</span>
		</h2>
		<button
			type="button"
			class="icon-button"
			title="Add saved repository"
			aria-label="Add saved repository"
			disabled={isCreating || editingId !== null}
			onclick={startCreate}
		>
			<Icon name="plus" />
		</button>
	</div>
	<ul class="profiles">
		{#if isCreating}
			<li class="card profile">{@render editForm()}</li>
		{/if}
		{#each profileStore.profiles as profile, index (profile.id)}
			<li
				class="card profile"
				class:dragging={dragId === profile.id}
				class:over={overId === profile.id && dragId !== profile.id}
				ondragover={(event) => onDragOver(event, profile.id)}
				ondrop={(event) => onDrop(event, profile.id)}
			>
				<button
					type="button"
					class="grip"
					draggable="true"
					data-grip={profile.id}
					title="Drag to reorder (or use Arrow Up/Down)"
					aria-label={`Reorder ${profile.name}`}
					ondragstart={(event) => onDragStart(event, profile.id)}
					ondragend={onDragEnd}
					onkeydown={(event) => onGripKey(event, profile.id, index)}
				>
					<Icon name="grip" />
				</button>
				{#if editingId === profile.id}
					{@render editForm()}
				{:else}
					<a class="info" href={`/r/${encodeSrc(profileToRef(profile))}`}>
						<strong>{profile.name}</strong>
						<span class="muted path">
							{FORGE_LABELS[profile.kind]} · {profile.host}/{profile.owner}/{profile.repo}
							{#if profile.ref}@{profile.ref}{/if}
							{#if profile.basePath}· {profile.basePath}{/if}
						</span>
					</a>
					<div class="row actions">
						{#if confirming?.id === profile.id}
							<span class="confirm-text">
								{confirming.action === 'delete' ? 'Delete this repository?' : 'Remove token?'}
							</span>
							<button type="button" class="danger" onclick={() => runConfirmed(profile)}>
								{confirming.action === 'delete' ? 'Delete' : 'Remove'}
							</button>
							<button type="button" onclick={() => (confirming = null)}>Cancel</button>
						{:else}
						<button
							type="button"
							class="icon-button"
							title="Edit"
							aria-label="Edit"
							disabled={isCreating || editingId !== null}
							onclick={() => startEdit(profile)}
						>
							<Icon name="edit" />
						</button>
						<button
							type="button"
							class="icon-button danger-hover"
							title={profile.token ? 'Remove token' : 'No token'}
							aria-label={profile.token ? 'Remove token' : 'No token'}
							disabled={!profile.token}
							onclick={() => (confirming = { id: profile.id, action: 'token' })}
						>
							<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<circle cx="5" cy="11" r="2.5" />
								<path d="M6.8 9.2L13 3M11 5l1.5 1.5M9.5 6.5L11 8" />
								<path d="M2 2l12 12" />
							</svg>
						</button>
						<button
							type="button"
							class="icon-button danger-hover"
							title="Delete"
							aria-label="Delete"
							onclick={() => (confirming = { id: profile.id, action: 'delete' })}
						>
							<Icon name="trash" />
						</button>
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
	{#if !isCreating && !profileStore.profiles.length}
		<p class="muted">No saved repositories yet. Use the + button to add one.</p>
	{/if}
</section>

<style>
	.split {
		display: inline-flex;
	}
	.part {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 0.7rem;
		box-sizing: border-box;
		/* Same height as a text input: 1.6 line-height + 0.45rem padding twice + 1px border twice. */
		height: calc(1.6rem + 0.9rem + 2px);
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

	h2 {
		font-size: 1rem;
		margin-bottom: 0.5rem;
	}

	.panel {
		margin-bottom: 2rem;
	}
	.section-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}
	.section-heading h2 {
		margin: 0;
	}

	.profiles {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.profile {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		justify-content: space-between;
		align-items: center;
	}
	.inline-form {
		flex: 1;
		min-width: 200px;
	}
	.profile:hover {
		border-color: var(--accent);
	}
	.profile.dragging {
		opacity: 0.45;
	}
	.profile.over {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--accent);
	}
	.grip {
		cursor: grab;
		background: none;
		border: none;
		padding: 0.25rem;
		color: var(--text-dim);
		display: inline-flex;
		align-items: center;
		touch-action: none;
	}
	.grip:active {
		cursor: grabbing;
	}
	.info {
		flex: 1;
		min-width: 200px;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		color: var(--text);
	}
	.info:hover {
		text-decoration: none;
	}
	.path {
		font-size: 0.8rem;
		font-family: var(--mono);
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.75rem;
	}
	.url-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.url-field {
		flex: 1;
		min-width: 0;
	}
	.profile-fields {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.confirm-text {
		font-size: 0.9rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.input-icon {
		position: relative;
		display: flex;
		align-items: center;
	}
	.input-icon :global(svg) {
		position: absolute;
		left: 0.6rem;
		color: var(--text-dim);
		pointer-events: none;
	}
	.input-icon input {
		width: 100%;
		padding-left: 2rem;
	}
	@media (max-width: 640px) {
		.profile-fields {
			grid-template-columns: 1fr;
		}
	}
</style>
