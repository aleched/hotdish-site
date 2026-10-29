<script lang="ts">
	import { DEFAULT_HOSTS, FORGE_LABELS, TOKEN_GUIDANCE } from '$lib/forge/factory';
	import { parseRepoInput } from '$lib/forge/parse';
	import type { ForgeKind } from '$lib/forge/types';
	import { encodeSrc } from '$lib/share/codec';
	import { profileStore, profileToRef, type Profile } from '$lib/store/profiles.svelte';
	import { clearBlobCache } from '$lib/cache/blobCache';

	const kinds: ForgeKind[] = ['github', 'gitlab', 'gitea'];

	let editingId = $state<string | null>(null);
	let name = $state('');
	let kind = $state<ForgeKind>('github');
	let host = $state('');
	let owner = $state('');
	let repo = $state('');
	let gitRef = $state('');
	let basePath = $state('');
	let token = $state('');
	let quickUrl = $state('');
	let error = $state<string | null>(null);
	let cacheMessage = $state<string | null>(null);

	function reset() {
		editingId = null;
		name = '';
		kind = 'github';
		host = '';
		owner = '';
		repo = '';
		gitRef = '';
		basePath = '';
		token = '';
		quickUrl = '';
		error = null;
	}

	function startEdit(profile: Profile) {
		editingId = profile.id;
		name = profile.name;
		kind = profile.kind;
		host = profile.host;
		owner = profile.owner;
		repo = profile.repo;
		gitRef = profile.ref ?? '';
		basePath = profile.basePath ?? '';
		token = profile.token ?? '';
		error = null;
	}

	function fillFromUrl() {
		error = null;
		if (!quickUrl.trim()) return;
		try {
			const ref = parseRepoInput(quickUrl, { fallbackKind: kind });
			kind = ref.kind;
			host = ref.host;
			owner = ref.owner;
			repo = ref.repo;
			if (ref.ref) gitRef = ref.ref;
			if (ref.basePath) basePath = ref.basePath;
			if (!name.trim()) name = `${ref.owner}/${ref.repo}`;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		}
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		error = null;

		if (!owner.trim() || !repo.trim()) {
			error = 'Owner and repository are required.';
			return;
		}

		profileStore.save({
			id: editingId ?? undefined,
			name: name.trim() || `${owner.trim()}/${repo.trim()}`,
			kind,
			host: host.trim() || DEFAULT_HOSTS[kind],
			owner: owner.trim(),
			repo: repo.trim(),
			ref: gitRef.trim() || undefined,
			basePath: basePath.trim().replace(/^\/+|\/+$/g, '') || undefined,
			token: token.trim() || undefined
		});

		reset();
	}

	async function emptyCache() {
		await clearBlobCache();
		cacheMessage = 'Cached recipe content cleared.';
		setTimeout(() => (cacheMessage = null), 3000);
	}
</script>

<svelte:head>
	<title>Settings — Hotdish</title>
</svelte:head>

<h1>Settings</h1>

<section class="panel">
	<h2>Saved repositories</h2>
	{#if profileStore.profiles.length === 0}
		<p class="muted">No repositories saved yet. Add one below.</p>
	{:else}
		<ul class="profiles">
			{#each profileStore.profiles as profile (profile.id)}
				<li class="card">
					<div class="info">
						<strong>{profile.name}</strong>
						<span class="muted path">
							{FORGE_LABELS[profile.kind]} · {profile.host}/{profile.owner}/{profile.repo}
							{#if profile.ref}@{profile.ref}{/if}
							{#if profile.basePath}· {profile.basePath}{/if}
						</span>
						<span class="muted path">
							{profile.token ? 'Token stored in this browser' : 'No token (public access only)'}
						</span>
					</div>
					<div class="row">
						<a class="button-link" href={`/r/${encodeSrc(profileToRef(profile))}`}>Open</a>
						<button type="button" onclick={() => startEdit(profile)}>Edit</button>
						{#if profile.token}
							<button type="button" onclick={() => profileStore.clearToken(profile.id)}>
								Remove token
							</button>
						{/if}
						<button type="button" class="danger" onclick={() => profileStore.remove(profile.id)}>
							Delete
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="panel">
	<h2>{editingId ? 'Edit repository' : 'Add a repository'}</h2>

	<form onsubmit={submit} class="form card">
		<div class="field">
			<label class="label" for="quick">Paste a repository URL</label>
			<div class="row">
				<input id="quick" type="text" bind:value={quickUrl} placeholder="https://gitlab.com/alice/recipes" />
				<button type="button" onclick={fillFromUrl}>Fill</button>
			</div>
		</div>

		<div class="grid">
			<div class="field">
				<label class="label" for="name">Name</label>
				<input id="name" type="text" bind:value={name} placeholder="My recipes" />
			</div>

			<div class="field">
				<label class="label" for="kind">Forge</label>
				<select id="kind" bind:value={kind}>
					{#each kinds as option (option)}
						<option value={option}>{FORGE_LABELS[option]}</option>
					{/each}
				</select>
			</div>

			<div class="field">
				<label class="label" for="host">Host</label>
				<input id="host" type="text" bind:value={host} placeholder={DEFAULT_HOSTS[kind]} />
			</div>

			<div class="field">
				<label class="label" for="owner">Owner</label>
				<input id="owner" type="text" bind:value={owner} />
			</div>

			<div class="field">
				<label class="label" for="repo">Repository</label>
				<input id="repo" type="text" bind:value={repo} />
			</div>

			<div class="field">
				<label class="label" for="ref">Branch (optional)</label>
				<input id="ref" type="text" bind:value={gitRef} placeholder="default branch" />
			</div>

			<div class="field">
				<label class="label" for="base">Sub-folder (optional)</label>
				<input id="base" type="text" bind:value={basePath} placeholder="recipes" />
			</div>
		</div>

		<div class="field">
			<label class="label" for="token">Access token (optional)</label>
			<input id="token" type="password" bind:value={token} autocomplete="off" spellcheck="false" />
			<p class="muted hint">{TOKEN_GUIDANCE[kind]}</p>
		</div>

		{#if error}
			<p class="banner error" role="alert">{error}</p>
		{/if}

		<div class="row">
			<button class="primary" type="submit">{editingId ? 'Save changes' : 'Add repository'}</button>
			{#if editingId}
				<button type="button" onclick={reset}>Cancel</button>
			{/if}
		</div>
	</form>
</section>

<section class="panel">
	<h2>How tokens are handled</h2>
	<div class="card stack">
		<p class="muted">
			Tokens are kept in this browser's <code>localStorage</code> and sent only to the forge they
			belong to. They are never placed in a URL, so they cannot leak through browser history,
			<code>Referer</code> headers or link previews.
		</p>
		<p class="muted">
			This also means a private repository cannot be shared: a share link carries only the
			repository identity and path. Recipients need their own access.
		</p>
		<p class="muted">
			Anyone with access to this browser profile can read a stored token. On a shared computer,
			leave the token blank and paste it per session, or remove it when you are done.
		</p>
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
	h1 {
		font-size: 1.5rem;
	}
	h2 {
		font-size: 1rem;
		margin-bottom: 0.5rem;
	}

	.panel {
		max-width: 760px;
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
	.profiles li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		justify-content: space-between;
		align-items: center;
	}
	.info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
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
		margin: 0.1rem 0 0;
	}

	.button-link {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.4rem 0.75rem;
		color: var(--text);
		font-size: 0.9rem;
	}
	.button-link:hover {
		text-decoration: none;
		border-color: var(--accent);
	}
</style>
