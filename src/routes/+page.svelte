<script lang="ts">
	import { goto } from '$app/navigation';
	import { DEFAULT_HOSTS, FORGE_LABELS, TOKEN_GUIDANCE } from '$lib/forge/factory';
	import { parseRepoInput } from '$lib/forge/parse';
	import type { ForgeKind, RepoRef } from '$lib/forge/types';
	import { encodeSrc } from '$lib/share/codec';
	import { profileStore, profileToRef } from '$lib/store/profiles.svelte';

	const kinds: ForgeKind[] = ['github', 'gitlab', 'gitea'];

	let input = $state('');
	let name = $state('');
	let kind = $state<ForgeKind>('github');
	let host = $state(DEFAULT_HOSTS.github);
	let gitRef = $state('');
	let basePath = $state('');
	let token = $state('');
	let error = $state<string | null>(null);

	function reset() {
		input = '';
		name = '';
		kind = 'github';
		host = DEFAULT_HOSTS.github;
		gitRef = '';
		basePath = '';
		token = '';
		error = null;
	}

	function onKindChange() {
		host = DEFAULT_HOSTS[kind];
	}

	/** Parses the form into a repo reference, applying the optional overrides. */
	function buildRef(): RepoRef | null {
		error = null;
		try {
			const parsed = parseRepoInput(input, { fallbackKind: kind });
			// A host typed in the URL wins; the Host field only applies to bare owner/repo input.
			const urlHostIsDefault = parsed.host === DEFAULT_HOSTS[parsed.kind];
			return {
				...parsed,
				host: urlHostIsDefault ? host.trim() || parsed.host : parsed.host,
				ref: gitRef.trim() || parsed.ref,
				basePath: basePath.trim().replace(/^\/+|\/+$/g, '') || parsed.basePath
			};
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
			return null;
		}
	}

	function add() {
		const ref = buildRef();
		if (!ref) return;
		profileStore.save({
			name: name.trim() || `${ref.owner}/${ref.repo}`,
			kind: ref.kind,
			host: ref.host,
			owner: ref.owner,
			repo: ref.repo,
			ref: ref.ref || undefined,
			basePath: ref.basePath || undefined,
			token: token.trim() || undefined
		});
		reset();
	}

	function open() {
		const ref = buildRef();
		if (!ref) return;
		profileStore.setSessionToken(ref, token.trim() || undefined);
		void goto(`/r/${encodeSrc(ref)}`);
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		open();
	}
</script>

<svelte:head>
	<title>Hotdish — recipes from any git repository</title>
</svelte:head>

{#if profileStore.profiles.length > 0}
	<section class="panel">
		<h2>Saved repositories</h2>
		<ul class="profiles">
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
{/if}

<section class="panel" id="repo-form">
	<h2>Add or open a repository</h2>

	<form onsubmit={submit} class="form card">
		<div class="field">
			<label class="label" for="input">Repository URL</label>
			<input
				id="input"
				type="text"
				bind:value={input}
				placeholder="https://github.com/alice/recipes or alice/recipes"
				autocomplete="off"
				spellcheck="false"
			/>
		</div>

		<div class="grid">
			<div class="field">
				<label class="label" for="name">Name</label>
				<input id="name" type="text" bind:value={name} placeholder="My recipes" />
			</div>

			<div class="field">
				<label class="label" for="kind">Forge</label>
				<select id="kind" bind:value={kind} onchange={onKindChange}>
					{#each kinds as option (option)}
						<option value={option}>{FORGE_LABELS[option]}</option>
					{/each}
				</select>
			</div>

			<div class="field">
				<label class="label" for="host">Host</label>
				<input id="host" type="text" bind:value={host} placeholder={DEFAULT_HOSTS[kind]} />
			</div>
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
		<p class="muted hint">{TOKEN_GUIDANCE[kind]}</p>

		{#if error}
			<p class="banner error" role="alert">{error}</p>
		{/if}

		<div class="row">
			<button class="primary" type="button" onclick={add} disabled={!input.trim()}>Add</button>
			<button type="submit" disabled={!input.trim()}>Open</button>
		</div>
	</form>
</section>

<style>
	h2 {
		font-size: 1rem;
		margin-bottom: 0.5rem;
	}

	.panel {
		margin-bottom: 2rem;
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
