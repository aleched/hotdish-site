<script lang="ts">
	import { goto } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import { FORGE_LABELS, TOKEN_GUIDANCE } from '$lib/forge/factory';
	import { detectForgeKind } from '$lib/forge/detect';
	import { knownForgeKind, parseRepoInput } from '$lib/forge/parse';
	import type { ForgeKind, RepoRef } from '$lib/forge/types';
	import { encodeSrc } from '$lib/share/codec';
	import { profileStore, profileToRef } from '$lib/store/profiles.svelte';
	import Icon from '$lib/ui/Icon.svelte';

	const kinds: ForgeKind[] = ['github', 'gitlab', 'gitea'];
	let isMounted = true;
	onDestroy(() => {
		isMounted = false;
	});

	let isCreating = $state(false);
	let input = $state('');
	let name = $state('');
	let kind = $state<ForgeKind | ''>('');
	let needsForgeChoice = $state(false);
	let isDetectingForge = $state(false);
	let gitRef = $state('');
	let basePath = $state('');
	let token = $state('');
	let error = $state<string | null>(null);

	function startCreate() {
		isCreating = true;
		input = '';
		name = '';
		kind = '';
		needsForgeChoice = false;
		gitRef = '';
		basePath = '';
		token = '';
		error = null;
	}

	function cancelCreate() {
		isCreating = false;
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
		const profile = profileStore.save({
			name: name.trim() || `${ref.owner}/${ref.repo}`,
			kind: ref.kind,
			host: ref.host,
			owner: ref.owner,
			repo: ref.repo,
			ref: ref.ref || undefined,
			basePath: ref.basePath || undefined,
			token: token.trim() || undefined
		});
		await goto(`/r/${encodeSrc(profileToRef(profile))}`);
	}
</script>

<svelte:head>
	<title>Hotdish — recipes from any git repository</title>
</svelte:head>

<section class="panel">
	<div class="section-heading">
		<h2>Saved repositories</h2>
		<button
			type="button"
			class="icon-button"
			title="Add saved repository"
			aria-label="Add saved repository"
			disabled={isCreating}
			onclick={startCreate}
		>
			<Icon name="plus" />
		</button>
	</div>
	<ul class="profiles">
		{#if isCreating}
			<li class="card profile editing">
				<form onsubmit={save} class="form">
					<div class="field">
						<label class="label" for="input">Repository URL</label>
						<input
							id="input"
							type="text"
							bind:value={input}
							placeholder="https://github.com/alice/recipes"
							autocomplete="off"
							spellcheck="false"
							disabled={isDetectingForge}
							oninput={onInput}
						/>
					</div>

					<div class="grid">
						<div class="field">
							<label class="label" for="name">Name</label>
							<input id="name" type="text" bind:value={name} placeholder="My recipes" />
						</div>
						{#if needsForgeChoice}
							<div class="field">
								<label class="label" for="kind">Forge type</label>
								<select id="kind" bind:value={kind}>
									<option value="">Select forge type</option>
									{#each kinds as option (option)}
										<option value={option}>{FORGE_LABELS[option]}</option>
									{/each}
								</select>
							</div>
						{/if}
					</div>

					<div class="grid">
						<div class="field">
							<label class="label" for="ref">Branch (optional)</label>
							<input id="ref" type="text" bind:value={gitRef} placeholder="default branch" />
						</div>
						<div class="field">
							<label class="label" for="base">Sub-folder (optional)</label>
							<input id="base" type="text" bind:value={basePath} placeholder="recipes" />
						</div>
						<div class="field">
							<label class="label" for="token">Access token (optional)</label>
							<input id="token" type="password" bind:value={token} autocomplete="off" spellcheck="false" />
						</div>
					</div>
					{#if kind}<p class="muted hint">{TOKEN_GUIDANCE[kind]}</p>{/if}
					{#if error}<p class="banner error" role="alert">{error}</p>{/if}
					<div class="row">
						<button
							class="primary"
							type="submit"
							disabled={!input.trim() || isDetectingForge || (needsForgeChoice && !kind)}
						>
							{isDetectingForge ? 'Detecting forge...' : 'Save and open'}
						</button>
						<button type="button" onclick={cancelCreate} disabled={isDetectingForge}>Cancel</button>
					</div>
				</form>
			</li>
		{/if}
		{#each profileStore.profiles as profile (profile.id)}
			<li class="card profile">
				<a class="info" href={`/r/${encodeSrc(profileToRef(profile))}`}>
					<strong>{profile.name}</strong>
					<span class="muted path">
						{FORGE_LABELS[profile.kind]} · {profile.host}/{profile.owner}/{profile.repo}
						{#if profile.ref}@{profile.ref}{/if}
						{#if profile.basePath}· {profile.basePath}{/if}
					</span>
					<span class="muted path">
						{profile.token ? 'Token stored in this browser' : 'No token (public access only)'}
					</span>
				</a>
			</li>
		{/each}
	</ul>
</section>

<style>
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
	.profile.editing {
		display: block;
	}
	.profile:hover {
		border-color: var(--accent);
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
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.label {
		font-size: 0.85rem;
		font-weight: 600;
	}
	.hint {
		font-size: 0.78rem;
		margin: 0;
	}
</style>
