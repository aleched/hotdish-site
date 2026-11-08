<script lang="ts">
	import { goto } from '$app/navigation';
	import { encodeSrc } from '#lib/share/codec.ts';
	import { encodeDocPath } from '#lib/paths.ts';
	import { repoStore } from '#lib/store/repo.svelte.ts';
	import { profileStore } from '#lib/store/profiles.svelte.ts';
	import { connectionStore } from '#lib/store/connection.svelte.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		/** Current document path, kept when switching so the same page opens on the other branch. */
		path?: string;
		disabled?: boolean;
	}

	let { path = '', disabled = false }: Props = $props();

	let open = $state(false);
	let branches = $state<string[]>([]);
	let defaultBranch = $state<string | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let filter = $state('');
	let creating = $state(false);
	let newName = $state('');
	let busy = $state(false);
	let root = $state<HTMLElement | null>(null);

	let current = $derived(repoStore.resolvedRef);
	let canCreate = $derived(Boolean(repoStore.provider?.authenticated) && connectionStore.online);
	let shown = $derived(
		branches.filter((name) => name.toLowerCase().includes(filter.trim().toLowerCase()))
	);

	function message(cause: unknown, fallback: string): string {
		return cause instanceof Error && cause.message ? cause.message : fallback;
	}

	async function loadBranches() {
		const provider = repoStore.provider;
		if (!provider) return;
		loading = true;
		error = null;
		try {
			const [list, fallback] = await Promise.all([
				provider.listBranches(),
				provider.resolveDefaultBranch()
			]);
			defaultBranch = fallback;
			// The default branch leads, the rest keep the forge's order.
			branches = [fallback, ...list.filter((name) => name !== fallback)];
		} catch (cause) {
			error = message(cause, m.branch_picker_error());
		} finally {
			loading = false;
		}
	}

	function toggle() {
		if (open) return close();
		open = true;
		filter = '';
		creating = false;
		newName = '';
		void loadBranches();
	}

	function close() {
		open = false;
	}

	async function switchTo(name: string) {
		const ref = repoStore.ref;
		if (!ref) return;
		close();
		if (name === current) return;
		// The default branch is stored as "no branch" so the repository keeps following the forge.
		const next = name === defaultBranch ? undefined : name;
		const profile = profileStore.profileFor(ref);
		if (profile) profileStore.save({ ...profile, ref: next });
		const suffix = path ? `/${encodeDocPath(path)}` : '';
		await goto(`/r/${encodeSrc({ ...ref, ref: next })}${suffix}`);
	}

	async function create() {
		const provider = repoStore.provider;
		const name = newName.trim();
		if (!provider || !current || !name || busy) return;
		busy = true;
		error = null;
		try {
			await provider.createBranch(name, current);
			await switchTo(name);
		} catch (cause) {
			error = message(cause, m.branch_picker_create_failed());
		} finally {
			busy = false;
		}
	}

	function onwindowclick(event: MouseEvent) {
		if (open && root && !root.contains(event.target as Node)) close();
	}

	function onkeydown(event: KeyboardEvent) {
		if (open && event.key === 'Escape') close();
	}
</script>

<svelte:window onclick={onwindowclick} {onkeydown} />

{#if current}
	<div class="branch" bind:this={root}>
		<button
			type="button"
			class="chip"
			title={disabled ? m.branch_picker_locked() : m.branch_picker_title()}
			aria-label={m.branch_picker_title()}
			aria-haspopup="listbox"
			aria-expanded={open}
			disabled={disabled || !connectionStore.online}
			onclick={toggle}
		>
			<Icon name="branch" size={14} />
			<span class="name">{current}</span>
		</button>

		{#if open}
			<div class="menu" role="dialog" aria-label={m.branch_picker_title()}>
				{#if creating}
					<form
						class="create"
						onsubmit={(event) => {
							event.preventDefault();
							void create();
						}}
					>
						<label for="new-branch">{m.branch_picker_create_from({ branch: current })}</label>
						<!-- svelte-ignore a11y_autofocus -->
						<input
							id="new-branch"
							type="text"
							autofocus
							autocomplete="off"
							autocapitalize="off"
							spellcheck="false"
							placeholder={m.branch_picker_new_name()}
							bind:value={newName}
						/>
						<div class="row">
							<button type="button" class="ghost" onclick={() => (creating = false)}>
								{m.common_cancel()}
							</button>
							<button type="submit" disabled={busy || !newName.trim()}>
								{m.branch_picker_create()}
							</button>
						</div>
					</form>
				{:else}
					<input
						class="filter"
						type="text"
						autocomplete="off"
						autocapitalize="off"
						spellcheck="false"
						placeholder={m.branch_picker_filter()}
						aria-label={m.branch_picker_filter()}
						bind:value={filter}
					/>
					<ul role="listbox" aria-label={m.branch_picker_title()}>
						{#each shown as name (name)}
							<li role="option" aria-selected={name === current}>
								<button type="button" class="item" onclick={() => switchTo(name)}>
									<span class="tick">{#if name === current}<Icon name="check" size={14} />{/if}</span>
									<span class="label">{name}</span>
									{#if name === defaultBranch}<span class="badge">{m.branch_picker_default()}</span>{/if}
								</button>
							</li>
						{/each}
						{#if loading}
							<li class="note">{m.branch_picker_loading()}</li>
						{:else if shown.length === 0 && !error}
							<li class="note">{m.branch_picker_none()}</li>
						{/if}
					</ul>
					{#if canCreate}
						<button type="button" class="item new" onclick={() => (creating = true)}>
							<span class="tick"><Icon name="plus" size={14} /></span>
							<span class="label">{m.branch_picker_new()}</span>
						</button>
					{/if}
				{/if}
				{#if error}<p class="error" role="alert">{error}</p>{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.branch {
		position: relative;
		flex: 0 1 auto;
		min-width: 0;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		max-width: 100%;
		padding: 0.25rem 0.55rem;
		font-family: var(--mono);
		font-size: 0.8rem;
		color: var(--text-dim);
		background: none;
		border: 1px solid var(--border);
		border-radius: 999px;
	}
	.chip:hover:not(:disabled),
	.chip[aria-expanded='true'] {
		color: var(--accent);
		border-color: var(--accent);
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.menu {
		position: absolute;
		top: calc(100% + 0.4rem);
		left: 0;
		z-index: 30;
		width: min(20rem, calc(100vw - 2rem));
		padding: 0.4rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
	}

	.filter,
	.create input {
		width: 100%;
		box-sizing: border-box;
		margin-bottom: 0.3rem;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 14rem;
		overflow-y: auto;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		padding: 0.4rem 0.35rem;
		text-align: start;
		font-family: var(--mono);
		font-size: 0.85rem;
		color: var(--text);
		background: none;
		border: none;
		border-radius: var(--radius-sm);
	}
	.item:hover,
	.item:focus-visible {
		background: var(--surface-2, var(--border));
	}
	.new {
		margin-top: 0.2rem;
		border-top: 1px solid var(--border);
		border-radius: 0;
		font-family: inherit;
		color: var(--accent);
	}
	.tick {
		display: inline-flex;
		width: 14px;
		flex-shrink: 0;
	}
	.label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.badge {
		font-size: 0.7rem;
		color: var(--text-dim);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0 0.4rem;
	}

	.note,
	.error {
		margin: 0;
		padding: 0.4rem 0.35rem;
		font-size: 0.8rem;
		color: var(--text-dim);
	}
	.error {
		color: var(--danger);
	}

	.create label {
		display: block;
		margin-bottom: 0.3rem;
		font-size: 0.8rem;
		color: var(--text-dim);
	}
	.row {
		display: flex;
		justify-content: flex-end;
		gap: 0.4rem;
	}
</style>
