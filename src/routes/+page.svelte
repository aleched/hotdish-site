<script lang="ts">
	import { goto } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import { FORGE_LABELS, TOKEN_GUIDANCE } from '#lib/forge/factory.ts';
	import { detectForgeKind } from '#lib/forge/detect.ts';
	import { knownForgeKind, parseRepoInput, withScheme } from '#lib/forge/parse.ts';
	import type { ForgeKind, RepoRef } from '#lib/forge/types.ts';
	import { encodeSrc } from '#lib/share/codec.ts';
	import { profileStore, profileToRef, type Profile } from '#lib/store/profiles.svelte.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import AboutBlurb from '#lib/ui/AboutBlurb.svelte';
	import { firstRunStore } from '#lib/store/firstRun.svelte.ts';
	import { EXAMPLE_NAME, EXAMPLE_REPO } from '#lib/forge/example.ts';
	import { m } from '#lib/paraglide/messages.js';

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
		if (!window.confirm(m.confirm_discard())) return;
		[input, name, kind, gitRef, basePath, token] = JSON.parse(baseline);
		needsForgeChoice = false;
		error = null;
	}

	let hintKind = $derived.by<ForgeKind | ''>(() => {
		if (kind) return kind;
		if (!input.trim()) return 'github';
		try {
			return knownForgeKind(new URL(withScheme(input)).host) ?? '';
		} catch {
			return '';
		}
	});

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

	function addExample() {
		profileStore.save({ name: EXAMPLE_NAME, ...EXAMPLE_REPO });
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

	function cancelForm() {
		if (formDirty && !window.confirm(m.confirm_discard())) return;
		cancelEdit();
	}

	// Clicking away from an untouched form simply closes it.
	$effect(() => {
		if (!isCreating && editingId === null) return;
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Element | null;
			if (!target || target.closest('.inline-form') || !target.isConnected) return;
			if (!formDirty && !isDetectingForge) {
				cancelEdit();
				// Swallow the click that follows, so a button such as "Add saved repository"
				// only closes the form instead of reopening it.
				if (target.closest('button')) {
					const swallow = (click: Event) => {
						click.stopPropagation();
						click.preventDefault();
					};
					window.addEventListener('click', swallow, { capture: true, once: true });
					setTimeout(() => window.removeEventListener('click', swallow, true), 400);
				}
			}
		};
		document.addEventListener('pointerdown', onPointerDown);
		return () => document.removeEventListener('pointerdown', onPointerDown);
	});

	function onInput() {
		kind = '';
		needsForgeChoice = false;
		error = null;
	}

	/** Parses the form into a repo reference, applying the optional overrides. */
	async function buildRef(): Promise<RepoRef | null> {
		error = null;
		try {
			if (!/^https?:\/\//i.test(withScheme(input))) {
				throw new Error(m.home_error_full_url());
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
				error = m.home_error_forge_unknown();
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

	let confirming = $state<{ id: string } | null>(null);

	function runConfirmed(profile: Profile) {
		profileStore.remove(profile.id);
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
	<title>{m.home_page_title()}</title>
</svelte:head>

{#snippet editForm()}
				<form onsubmit={save} class="form inline-form">
					<div class="url-row">
						<div class="field url-field">
							<div class="input-icon" title={m.home_url_required()}>
								<Icon name="link" />
								<input
									id="input"
									type="text"
									aria-label={m.home_url()}
									aria-required="true"
									bind:value={input}
									placeholder="https://github.com/alice/notes"
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
									title={m.common_discard_changes()}
									aria-label={m.common_discard_changes()}
									disabled={isDetectingForge}
									onclick={undoForm}
								>
									<Icon name="undo" />
								</button>
							{/if}
							<button
								type="button"
								class="part"
								title={m.common_cancel()}
								aria-label={m.common_cancel()}
								disabled={isDetectingForge}
								onclick={cancelForm}
							>
								<Icon name="cancel" />
							</button>
							<button
								class="part save"
								type="submit"
								title={isDetectingForge ? m.home_detecting() : isCreating ? m.home_save_open() : m.common_save_changes()}
								aria-label={isCreating ? m.home_save_open() : m.common_save_changes()}
								disabled={!input.trim() || isDetectingForge || (needsForgeChoice && !kind)}
							>
								<Icon name="save" />
							</button>
						</div>
					</div>

					<div class="grid profile-fields">
						<div class="input-icon" title={m.home_name()}>
							<Icon name="repos" />
							<input id="name" type="text" aria-label={m.home_name()} bind:value={name} placeholder={m.home_name()} />
						</div>
						<div class="input-icon" title={m.home_branch()}>
							<Icon name="branch" />
							<input id="ref" type="text" aria-label={m.home_branch()} bind:value={gitRef} placeholder="main" />
						</div>
						<div class="input-icon" title={m.home_subfolder()}>
							<Icon name="folder" />
							<input id="base" type="text" aria-label={m.home_subfolder()} bind:value={basePath} placeholder="/" />
						</div>
					</div>

					<div class="input-icon" title={m.home_token()}>
						{#if token}
							<button
								type="button"
								class="token-clear"
								title={m.home_token_clear()}
								aria-label={m.home_token_clear()}
								onclick={() => (token = '')}
							>
								<Icon name="keyoff" />
							</button>
						{:else}
							<Icon name="key" />
						{/if}
						<input
							id="token"
							type="password"
							aria-label={m.home_token()}
							bind:value={token}
							placeholder={hintKind ? TOKEN_GUIDANCE[hintKind] : m.token_placeholder_generic()}
							autocomplete="off"
							spellcheck="false"
						/>
					</div>
					{#if needsForgeChoice}
						<div class="field">
							<select id="kind" aria-label={m.home_forge_type()} bind:value={kind}>
								<option value="">{m.home_forge_option()}</option>
								{#each kinds as option (option)}
									<option value={option}>{FORGE_LABELS[option]}</option>
								{/each}
							</select>
						</div>
					{/if}
					{#if error}<p class="banner error" role="alert">{error}</p>{/if}
				</form>
{/snippet}

{#if !firstRunStore.welcomeDismissed}
	<section class="card welcome stack">
		<button
			type="button"
			class="icon-button welcome-dismiss"
			title={m.common_dismiss()}
			aria-label={m.common_dismiss()}
			onclick={() => firstRunStore.dismissWelcome()}
		>
			<Icon name="cancel" />
		</button>
		<AboutBlurb />
	</section>
{/if}

<section class="panel">
	<div class="section-heading">
		<h2 title={m.home_saved_repos()}>
			<Icon name="repos" size={20} /><span class="visually-hidden">{m.home_saved_repos()}</span>
		</h2>
		<button
			type="button"
			class="icon-button"
			title={m.home_add_repo()}
			aria-label={m.home_add_repo()}
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
					title={m.home_reorder_hint()}
					aria-label={m.home_reorder({ name: profile.name })}
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
							{#if profile.token}<span class="has-token" title={m.home_token_saved()}><Icon name="key" size={14} /></span>{/if}{FORGE_LABELS[profile.kind]} · {profile.host}/{profile.owner}/{profile.repo}
							{#if profile.ref}@{profile.ref}{/if}
							{#if profile.basePath}· {profile.basePath}{/if}
						</span>
					</a>
					<div class="row actions">
						{#if confirming?.id === profile.id}
							<span class="confirm-text" title={m.home_delete_confirm()} aria-label={m.home_delete_confirm()}><Icon name="confirm" size={20} /></span>
							<div class="split">
								<button
									type="button"
									class="part"
									title={m.common_cancel()}
									aria-label={m.common_cancel()}
									onclick={() => (confirming = null)}
								>
									<Icon name="cancel" />
								</button>
								<button
									type="button"
									class="part danger-part"
									title={m.common_confirm_delete()}
									aria-label={m.common_confirm_delete()}
									onclick={() => runConfirmed(profile)}
								>
									<Icon name="trash" />
								</button>
							</div>
						{:else}
							<div class="split">
								<button
									type="button"
									class="part"
									title={m.common_edit()}
									aria-label={m.common_edit()}
									disabled={isCreating || editingId !== null}
									onclick={() => startEdit(profile)}
								>
									<Icon name="edit" />
								</button>
								<button
									type="button"
									class="part danger-hover"
									title={m.common_delete()}
									aria-label={m.common_delete()}
									onclick={() => (confirming = { id: profile.id })}
								>
									<Icon name="trash" />
								</button>
							</div>
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
	{#if !isCreating && !profileStore.profiles.length}
		<EmptyState icon="empty" label={m.home_empty()} />
		<div class="row example-row">
			<button type="button" class="dialog-button" onclick={addExample}>
				<Icon name="fork-knife" />{m.home_try_example()}
			</button>
		</div>
	{/if}
</section>

<style>
	.example-row {
		justify-content: center;
		margin-top: 0.5rem;
	}
	.welcome {
		position: relative;
		margin-bottom: 1rem;
		padding-right: 2.75rem;
	}
	.welcome-dismiss {
		position: absolute;
		top: 0.4rem;
		right: 0.4rem;
	}
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
	.part.danger-part {
		border-color: var(--danger);
		color: var(--danger);
		position: relative;
	}
	.part.danger-hover:hover:not(:disabled) {
		border-color: var(--danger);
		color: var(--danger);
	}
	.has-token {
		display: inline-flex;
		vertical-align: -0.2em;
		margin-right: 0.35rem;
	}
	.input-icon .token-clear {
		position: absolute;
		left: 0.25rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem;
		border: none;
		background: none;
		color: var(--text-dim);
		cursor: pointer;
		line-height: 0;
	}
	.input-icon .token-clear:hover {
		color: var(--danger);
	}
	.input-icon .token-clear :global(svg) {
		position: static;
		color: inherit;
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
		display: inline-flex;
		color: var(--danger);
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
