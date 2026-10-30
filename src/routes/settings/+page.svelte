<script lang="ts">
	import { DEFAULT_HOSTS, FORGE_LABELS, TOKEN_GUIDANCE } from '$lib/forge/factory';
	import { parseRepoInput } from '$lib/forge/parse';
	import type { ForgeKind } from '$lib/forge/types';
	import { encodeSrc } from '$lib/share/codec';
	import { profileStore, profileToRef, type Profile } from '$lib/store/profiles.svelte';
	import { themeStore, THEME_ACCENTS, THEME_MODES } from '$lib/store/theme.svelte';
	import { clearBlobCache } from '$lib/cache/blobCache';
	import { historyStore } from '$lib/store/history.svelte';
	import Icon from '$lib/ui/Icon.svelte';

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

	let dragId = $state<string | null>(null);
	let overId = $state<string | null>(null);

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
	}

	function onKindChange() {
		host = DEFAULT_HOSTS[kind];
	}

	function save(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		try {
			const parsed = parseRepoInput(input, { fallbackKind: kind });
			// A host typed in the URL wins; the Host field only applies to bare owner/repo input.
			const urlHostIsDefault = parsed.host === DEFAULT_HOSTS[parsed.kind];
			const ref = {
				...parsed,
				host: urlHostIsDefault ? host.trim() || parsed.host : parsed.host,
				ref: gitRef.trim() || parsed.ref,
				basePath: basePath.trim().replace(/^\/+|\/+$/g, '') || parsed.basePath
			};
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
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		}
	}

	async function emptyCache() {
		await clearBlobCache();
		historyStore.reset();
		cacheMessage = 'Cached recipe content cleared.';
		setTimeout(() => (cacheMessage = null), 3000);
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
	<title>Settings — Hotdish</title>
</svelte:head>

<h1>Settings</h1>

<section class="panel">
	<h2>Saved repositories</h2>
	{#if profileStore.profiles.length === 0}
		<p class="muted">No saved repositories yet. Add one from the home page.</p>
	{:else}
		<p class="muted hint">Drag the handle to reorder. The home page uses the same order.</p>
		<ul class="profiles">
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
						<form onsubmit={save} class="form inline-form">
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
							{#if error}<p class="banner error" role="alert">{error}</p>{/if}
							<div class="row">
								<button class="primary" type="submit" disabled={!input.trim()}>Save changes</button>
								<button type="button" onclick={reset}>Cancel</button>
							</div>
						</form>
					{:else}
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
					{/if}
					<div class="row actions">
						{#if editingId !== profile.id}
							<button
								type="button"
								class="icon-button"
								title="Edit"
								aria-label="Edit"
								disabled={editingId !== null}
								onclick={() => startEdit(profile)}
							>
								<Icon name="edit" />
							</button>
							{#if profile.token}
								<button
									type="button"
									class="icon-button"
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
						{/if}
						<button
							type="button"
							class="icon-button danger-hover"
							title="Delete"
							aria-label="Delete"
							onclick={() => {
								profileStore.remove(profile.id);
								if (editingId === profile.id) reset();
							}}
						>
							<Icon name="trash" />
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
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
		margin: 0 0 0.5rem;
	}
	.form .hint {
		margin: 0;
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
