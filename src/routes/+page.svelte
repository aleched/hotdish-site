<script lang="ts">
	import { goto } from '$app/navigation';
	import { DEFAULT_HOSTS, FORGE_LABELS, TOKEN_GUIDANCE } from '$lib/forge/factory';
	import { parseRepoInput } from '$lib/forge/parse';
	import type { ForgeKind, RepoRef } from '$lib/forge/types';
	import { encodeSrc } from '$lib/share/codec';
	import { profileStore, profileToRef, type Profile } from '$lib/store/profiles.svelte';
	import { themeStore, THEME_ACCENTS, THEME_MODES } from '$lib/store/theme.svelte';
	import { clearBlobCache } from '$lib/cache/blobCache';
	import { historyStore } from '$lib/store/history.svelte';

	const kinds: ForgeKind[] = ['github', 'gitlab', 'gitea'];

	let editingId = $state<string | null>(null);
	let input = $state('');
	let name = $state('');
	let kind = $state<ForgeKind>('github');
	let host = $state(DEFAULT_HOSTS.github);
	let gitRef = $state('');
	let basePath = $state('');
	let token = $state('');
	let error = $state<string | null>(null);
	let cacheMessage = $state<string | null>(null);

	function reset() {
		editingId = null;
		input = '';
		name = '';
		kind = 'github';
		host = DEFAULT_HOSTS.github;
		gitRef = '';
		basePath = '';
		token = '';
		error = null;
	}

	function startEdit(profile: Profile) {
		editingId = profile.id;
		input = `https://${profile.host}/${profile.owner}/${profile.repo}`;
		name = profile.name;
		kind = profile.kind;
		host = profile.host;
		gitRef = profile.ref ?? '';
		basePath = profile.basePath ?? '';
		token = profile.token ?? '';
		error = null;
		document.getElementById('repo-form')?.scrollIntoView({ behavior: 'smooth' });
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
		if (editingId) add();
		else open();
	}

	async function emptyCache() {
		await clearBlobCache();
		historyStore.reset();
		cacheMessage = 'Cached recipe content cleared.';
		setTimeout(() => (cacheMessage = null), 3000);
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
					<div class="row actions">
						<button type="button" title="Edit" aria-label="Edit" onclick={() => startEdit(profile)}>
							<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M11.2 2.3a1.5 1.5 0 0 1 2.1 0l.4.4a1.5 1.5 0 0 1 0 2.1L5.4 13.1 2 14l.9-3.4z" />
								<path d="M10 3.5l2.5 2.5" />
							</svg>
						</button>
						{#if profile.token}
							<button
								type="button"
								title="Remove token"
								aria-label="Remove token"
								onclick={() => profileStore.clearToken(profile.id)}
							>
								<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<circle cx="5" cy="11" r="2.5" />
									<path d="M6.8 9.2L13 3M11 5l1.5 1.5M9.5 6.5L11 8" />
									<path d="M2 2l12 12" />
								</svg>
							</button>
						{/if}
						<button
							type="button"
							class="danger"
							title="Delete"
							aria-label="Delete"
							onclick={() => profileStore.remove(profile.id)}
						>
							<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.5 6.5v4.5M9.5 6.5v4.5" />
							</svg>
						</button>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<section class="panel" id="repo-form">
	<h2>{editingId ? 'Edit repository' : 'Add or open a repository'}</h2>

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
			{#if editingId}
				<button class="primary" type="submit" disabled={!input.trim()}>Save changes</button>
				<button type="button" onclick={reset}>Cancel</button>
			{:else}
				<button class="primary" type="button" onclick={add} disabled={!input.trim()}>Add</button>
				<button type="submit" disabled={!input.trim()}>Open</button>
			{/if}
		</div>
	</form>
</section>

<section class="panel">
	<h2>Theme</h2>
	<div class="card stack">
		<div class="field">
			<span class="label">Appearance</span>
			<div class="row choices" role="radiogroup" aria-label="Appearance">
				{#each THEME_MODES as mode (mode)}
					<button
						type="button"
						role="radio"
						aria-checked={themeStore.mode === mode}
						class="choice"
						class:selected={themeStore.mode === mode}
						onclick={() => themeStore.setMode(mode)}
					>
						{mode[0].toUpperCase() + mode.slice(1)}
					</button>
				{/each}
			</div>
		</div>
		<div class="field">
			<span class="label">Accent color</span>
			<div class="row choices" role="radiogroup" aria-label="Accent color">
				{#each THEME_ACCENTS as accent (accent.id)}
					<button
						type="button"
						role="radio"
						aria-checked={themeStore.accent === accent.id}
						class="choice"
						class:selected={themeStore.accent === accent.id}
						onclick={() => themeStore.setAccent(accent.id)}
					>
						<span class="swatch" style:background={accent.color}></span>
						{accent.label}
					</button>
				{/each}
			</div>
		</div>
	</div>
</section>

<section class="panel">
	<h2>Cache</h2>
	<div class="card stack">
		<p class="muted">
			Recipe content is cached by its git blob id, so a file is re-fetched only when it actually
			changes. Clearing the cache is safe and only costs a few extra requests.
		</p>
		<div class="row">
			<button type="button" onclick={emptyCache}>Clear cached content</button>
			{#if cacheMessage}<span class="muted">{cacheMessage}</span>{/if}
		</div>
	</div>
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

	.profile .actions {
		flex-basis: 100%;
		flex-wrap: wrap;
	}
	.choices {
		flex-wrap: wrap;
	}

	.choice {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.choice.selected {
		border-color: var(--accent);
		color: var(--accent);
	}
	.swatch {
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 50%;
		display: inline-block;
	}
</style>
