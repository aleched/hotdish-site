<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { decodeSrc } from '#lib/share/codec.ts';
	import type { RepoRef } from '#lib/forge/types.ts';
	import { ForgeError } from '#lib/forge/errors.ts';
	import { analyzeChanges, buildFileOps, defaultCommitMessage, type ChangeStatus } from '#lib/changes.ts';
	import { diffLines } from '#lib/util/diff.ts';
	import { toRelative } from '#lib/paths.ts';
	import { repoStore } from '#lib/store/repo.svelte.ts';
	import { profileStore } from '#lib/store/profiles.svelte.ts';
	import CommitDialog from '#lib/ui/CommitDialog.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Loading from '#lib/ui/Loading.svelte';
	import { m } from '#lib/paraglide/messages.js';

	let src = $derived(page.params.src ?? '');
	let ref = $derived.by<RepoRef | null>(() => {
		try {
			return decodeSrc(src);
		} catch {
			return null;
		}
	});

	$effect(() => {
		if (!ref) return;
		void repoStore.load(ref, profileStore.tokenFor(ref));
	});

	let statuses = $state<ChangeStatus[]>([]);
	let checking = $state(false);
	let committing = $state(false);
	let error = $state<unknown>(null);
	let dialog = $state(false);
	let message = $state('');
	let expanded = $state<Record<string, boolean>>({});
	// Unchecked paths, so a change staged later starts out checked.
	let excluded = $state<Record<string, boolean>>({});
	// The path whose discard awaits confirmation, or ALL for the discard-all button.
	let confirming = $state<string | null>(null);
	const ALL = '\0all';

	let selected = $derived(repoStore.pending.filter((change) => !excluded[change.path]));
	let allChecked = $derived(selected.length === repoStore.pending.length);
	let expandable = $derived(repoStore.pending.filter((change) => change.kind !== 'delete'));
	let allExpanded = $derived(expandable.length > 0 && expandable.every((change) => expanded[change.path]));

	function toggleChecks() {
		excluded = allChecked ? Object.fromEntries(repoStore.pending.map((change) => [change.path, true])) : {};
	}

	function toggleExpanded() {
		const next = !allExpanded;
		expanded = Object.fromEntries(expandable.map((change) => [change.path, next]));
	}

	async function discard(path: string) {
		confirming = null;
		if (path === ALL) await repoStore.discardAll();
		else await repoStore.discardChange(path);
	}

	let conflicts = $derived(new Map(statuses.map((status) => [status.change.path, status.conflict])));

	// Looks for remote changes to the same files so conflicts show before committing.
	$effect(() => {
		const provider = repoStore.provider;
		const branch = repoStore.resolvedRef;
		const list = repoStore.pending;
		if (repoStore.status !== 'ready' || !provider || !branch || list.length === 0) {
			statuses = [];
			return;
		}
		let stale = false;
		checking = true;
		provider
			.listTree(branch)
			.then((tree) => {
				if (!stale) statuses = analyzeChanges(list, tree.entries);
			})
			.catch(() => {
				if (!stale) statuses = [];
			})
			.finally(() => {
				if (!stale) checking = false;
			});
		return () => {
			stale = true;
		};
	});

	function openDialog() {
		// The dialog takes a single line, so a multi-file default keeps just its heading.
		message = defaultCommitMessage(selected).split('\n')[0];
		error = null;
		dialog = true;
	}

	async function commit() {
		const provider = repoStore.provider;
		const branch = repoStore.resolvedRef;
		if (!provider || !branch) {
			error = new Error(m.error_repo_not_loaded());
			return;
		}
		const chosen = $state.snapshot(selected);
		committing = true;
		error = null;
		try {
			// A push that lands between listing and committing is retried once on the new tip.
			for (let attempt = 0; ; attempt++) {
				const tree = await provider.listTree(branch);
				const ops = buildFileOps(analyzeChanges(chosen, tree.entries));
				try {
					await provider.commitChanges({ branch, message: message.trim(), ops });
					break;
				} catch (cause) {
					if (attempt === 0 && cause instanceof ForgeError && cause.kind === 'conflict') continue;
					throw cause;
				}
			}
			await repoStore.commitDone(chosen);
			dialog = false;
			if (repoStore.pending.length === 0) await goto(`/r/${src}`);
		} catch (cause) {
			error = cause;
		} finally {
			committing = false;
		}
	}

	const KIND_ICONS = { add: 'plus', edit: 'edit', delete: 'trash', move: 'move' } as const;
	const KIND_LABELS = {
		add: m.changes_add,
		edit: m.changes_edit,
		delete: m.changes_delete,
		move: m.changes_move
	} as const;
	const CONFLICT_LABELS = {
		'remote-changed': m.changes_conflict_changed,
		'remote-deleted': m.changes_conflict_deleted,
		'remote-exists': m.changes_conflict_exists
	} as const;

	function shown(path: string): string {
		return toRelative(path, repoStore.basePath);
	}
</script>

<svelte:head>
	<title>{m.changes_pending({ count: repoStore.pending.length })}</title>
</svelte:head>

{#snippet confirmDiscard(path: string, label: string)}
	<span class="confirm-text" title={label} aria-label={label}><Icon name="confirm" size={20} /></span>
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
			title={label}
			aria-label={label}
			disabled={committing}
			onclick={() => discard(path)}
		>
			<Icon name="undo" />
		</button>
	</div>
{/snippet}

<div class="head">
	{#if repoStore.pending.length > 0}
		<div class="split">
			<button
				type="button"
				class="part"
				title={allChecked ? m.changes_uncheck_all() : m.changes_check_all()}
				aria-label={allChecked ? m.changes_uncheck_all() : m.changes_check_all()}
				aria-pressed={allChecked}
				disabled={committing}
				onclick={toggleChecks}
			>
				<Icon name={allChecked ? 'check-all' : 'check-none'} />
			</button>
			<button
				type="button"
				class="part"
				title={allExpanded ? m.changes_collapse_all() : m.changes_expand_all()}
				aria-label={allExpanded ? m.changes_collapse_all() : m.changes_expand_all()}
				aria-expanded={allExpanded}
				disabled={expandable.length === 0}
				onclick={toggleExpanded}
			>
				<Icon name={allExpanded ? 'collapse' : 'expand'} />
			</button>
		</div>
	{/if}
	<h1>{m.changes_pending({ count: repoStore.pending.length })}</h1>
	{#if repoStore.pending.length > 0}
		<div class="row end">
			{#if confirming === ALL}
				{@render confirmDiscard(ALL, m.changes_discard_all_confirm())}
			{:else}
				<div class="split">
					<button
						type="button"
						class="part danger-hover"
						title={m.changes_discard_all()}
						aria-label={m.changes_discard_all()}
						disabled={committing}
						onclick={() => (confirming = ALL)}
					>
						<Icon name="undo" />
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if !ref}
	<p class="banner error">{m.repo_open_different()}</p>
{:else if repoStore.status === 'loading' || repoStore.status === 'idle'}
	<Loading />
{:else if repoStore.pending.length === 0}
	<EmptyState icon="empty" label={m.changes_empty()} />
{:else}
	<ul class="list">
		{#each repoStore.pending as change (change.path)}
			{@const conflict = conflicts.get(change.path)}
			<li class="card">
				<div class="row">
					<input
						type="checkbox"
						class="check"
						checked={!excluded[change.path]}
						disabled={committing}
						aria-label={shown(change.path)}
						onchange={(event) => (excluded[change.path] = !event.currentTarget.checked)}
					/>
					<span class="kind" title={KIND_LABELS[change.kind]()}>
						<Icon name={KIND_ICONS[change.kind]} size={16} />
					</span>
					<button
						type="button"
						class="name"
						aria-expanded={expanded[change.path] ?? false}
						onclick={() => (expanded[change.path] = !expanded[change.path])}
					>
						{#if change.kind === 'move' && change.from}
							<code>{shown(change.from)}</code> → <code>{shown(change.path)}</code>
						{:else}
							<code>{shown(change.path)}</code>
						{/if}
					</button>
					{#if confirming === change.path}
						{@render confirmDiscard(change.path, m.changes_discard_confirm())}
					{:else}
						<button
							type="button"
							class="icon-button"
							title={m.changes_discard()}
							aria-label={m.changes_discard()}
							disabled={committing}
							onclick={() => (confirming = change.path)}
						>
							<Icon name="undo" size={16} />
						</button>
					{/if}
				</div>
				{#if conflict}
					<p class="banner warn">{CONFLICT_LABELS[conflict]()}</p>
				{/if}
				{#if expanded[change.path] && change.kind !== 'delete'}
					{@const diff = diffLines(change.baseRaw ?? '', change.raw ?? '')}
					<pre class="diff">{#each diff.lines as line, index (index)}<span class={line.kind}
							>{line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}{line.text}</span
						>{'\n'}{/each}</pre>
				{/if}
			</li>
		{/each}
	</ul>

	<div class="row end">
		{#if checking}<span class="muted small">{m.changes_checking()}</span>{/if}
		<button
			type="button"
			class="commit"
			disabled={selected.length === 0 || committing}
			onclick={openDialog}
		>
			{m.changes_commit({ count: selected.length })}
		</button>
	</div>
{/if}

{#if dialog}
	<CommitDialog
		title={m.changes_commit({ count: selected.length })}
		bind:message
		busy={committing}
		{error}
		wide
		onsubmit={commit}
		oncancel={() => (dialog = false)}
	/>
{/if}

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 1rem;
	}
	.head h1 {
		margin: 0;
		font-size: 1.3rem;
		flex: 1;
		min-width: 0;
	}
	.list {
		list-style: none;
		margin: 0 0 1rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.card {
		padding: 0.6rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.check {
		margin: 0;
		width: 1rem;
		height: 1rem;
		accent-color: var(--accent);
		cursor: pointer;
	}
	.kind {
		display: inline-flex;
		color: var(--accent);
	}
	.name {
		flex: 1;
		min-width: 0;
		text-align: left;
		background: none;
		border: none;
		padding: 0;
		color: var(--text);
		cursor: pointer;
		overflow-wrap: anywhere;
	}
	.end {
		justify-content: flex-end;
	}
	.small {
		font-size: 0.78rem;
	}
	.banner {
		margin: 0;
	}
	.commit:not(:disabled) {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
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
		height: calc(1.6rem + 0.9rem + 2px);
		border: 1px solid var(--border);
		border-radius: 0;
		background: var(--surface);
		color: var(--text);
		line-height: 0;
		cursor: pointer;
	}
	.part:hover:not(:disabled) {
		border-color: var(--accent);
		position: relative;
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
	.split > .part:only-child {
		border-radius: var(--radius-sm);
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
	.confirm-text {
		display: inline-flex;
		color: var(--danger);
	}
	.diff {
		max-height: 320px;
		overflow: auto;
		background: var(--surface-2);
		border-radius: var(--radius-sm);
		padding: 0.6rem;
		font-size: 0.8rem;
		margin: 0;
	}
	.diff span {
		display: block;
		white-space: pre-wrap;
	}
	.diff .added {
		color: var(--ok, #16a34a);
	}
	.diff .removed {
		color: var(--danger);
	}
	.diff .context {
		color: var(--text-dim);
	}
</style>
