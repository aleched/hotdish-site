<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { encodeSrc } from '#lib/share/codec.ts';
	import { connectionStore } from '#lib/store/connection.svelte.ts';
	import { prefetchSaved, syncNow } from '#lib/cache/prefetch.ts';
	import { applyUpdate, initUpdates, shouldApplyUpdate } from '#lib/pwa/update.ts';
	import { repoStore } from '#lib/store/repo.svelte.ts';
	import { profileStore, profileToRef } from '#lib/store/profiles.svelte.ts';
	import { navStore } from '#lib/store/nav.svelte.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import BranchPicker from '#lib/ui/BranchPicker.svelte';
	import RateLimitPrompt from '#lib/ui/RateLimitPrompt.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { localeDirection } from '#lib/i18n/locales.ts';

	let { children } = $props();

	$effect(() => {
		document.documentElement.lang = getLocale();
		document.documentElement.dir = localeDirection(getLocale());
	});

	let activeSrc = $derived(page.params.src ?? null);

	let repoName = $derived(repoStore.ref
		? profileStore.profileFor(repoStore.ref)?.name?.trim() || `${repoStore.ref.owner}/${repoStore.ref.repo}`
		: null);

	let connLabel = $derived(connectionStore.state === 'syncing'
		? m.conn_syncing()
		: connectionStore.state === 'live' ? m.conn_live() : m.conn_offline());

	let connTitle = $derived(connectionStore.lastSyncedAt
		? `${connLabel}\n${m.conn_last_synced({
			time: new Date(connectionStore.lastSyncedAt).toLocaleString(getLocale())
		})}`
		: connLabel);

	onMount(() => {
		// Reopening the app on the landing page resumes the last repository.
		const last = profileStore.lastOpened;
		if (page.url.pathname === '/' && last) {
			void goto(`/r/${encodeSrc(profileToRef(last))}`, { replaceState: true });
		}
		initUpdates();
		// Let the page itself load first, then fill the offline copy of the other saved repos.
		const timer = setTimeout(() => void prefetchSaved().catch(() => {}), 3000);
		const reconnect = () => void syncNow();
		window.addEventListener('online', reconnect);
		return () => {
			clearTimeout(timer);
			window.removeEventListener('online', reconnect);
		};
	});

	beforeNavigate((navigation) => {
		if (navigation.shallow && navigation.type === 'goto') return;

		const to = navigation.to?.url;
		if (!to || navigation.willUnload || to.origin !== location.origin) return;
		if (navigation.from?.url.searchParams.has('edit') || to.searchParams.has('edit')) return;
		if (!shouldApplyUpdate()) return;
		navigation.cancel();
		applyUpdate(to.href);
	});

	function retry() {
		if (connectionStore.state !== 'syncing') void syncNow({ force: true });
	}

	let isUnsaved = $derived(!!repoStore.ref && !profileStore.profileFor(repoStore.ref));

	function saveRepo() {
		const ref = repoStore.ref;
		if (!ref) return;
		profileStore.save({
			name: `${ref.owner}/${ref.repo}`,
			kind: ref.kind,
			host: ref.host,
			owner: ref.owner,
			repo: ref.repo,
			ref: ref.ref,
			basePath: ref.basePath,
			token: profileStore.tokenFor(ref)
		});
	}
</script>

<svelte:head>
	<title>{m.app_title()}</title>
	<meta name="description" content={m.app_description()} />
</svelte:head>

<div class="shell">
	<header class="no-print">
		<div class="container bar">
			{#if activeSrc}
				<button
					type="button"
					class="burger ghost"
					class:open={navStore.open}
					aria-label={m.nav_menu()}
					aria-expanded={navStore.open}
					aria-controls="doc-nav"
					onclick={() => navStore.toggle()}
				>
					<svg
						viewBox="0 0 20 20"
						width="20"
						height="20"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<path class="bar-top" d="M3 5.5h14"></path>
						<path class="bar-mid" d="M3 10h14"></path>
						<path class="bar-bot" d="M3 14.5h14"></path>
					</svg>
				</button>
			{/if}
			<a class="brand" href="/">
				<img class="mark" src="/hotdish-logo.png" alt="" width="36" height="36" />
				<span>Hotdish</span>
			</a>

			{#if repoName && activeSrc}
				<a class="repo" href={`/r/${activeSrc}`} title={m.nav_browse_repo()}>{repoName}</a>
				{#if isUnsaved}
					<button
						type="button"
						class="icon-button save-repo"
						title={m.nav_save_repo()}
						aria-label={m.nav_save_repo()}
						onclick={saveRepo}
					>
						<Icon name="plus" />
					</button>
				{/if}
				<BranchPicker path={page.params.path ?? ''} disabled={page.url.searchParams.has('edit')} />
			{/if}

			<div class="spacer"></div>
			<button
				type="button"
				class="icon-button conn {connectionStore.state}"
				title={connTitle}
				aria-label={connTitle}
				aria-busy={connectionStore.state === 'syncing'}
				onclick={retry}
			>
				<Icon
					name={connectionStore.state === 'syncing' ? 'cloud-sync' : connectionStore.state === 'live' ? 'cloud' : 'cloud-off'}
					size={20}
				/>
			</button>
			<a class="nav settings" href="/settings" title={m.nav_settings()} aria-label={m.nav_settings()}>
				<Icon name="settings" size={20} />
			</a>
		</div>
	</header>

	<main class="container">
		{@render children()}
	</main>
</div>

<RateLimitPrompt />

<style>
	.shell {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	header {
		border-bottom: 1px solid var(--border);
		background: var(--surface);
		position: sticky;
		top: 0;
		z-index: 20;
	}

	.bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		height: 56px;
	}

	.brand {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		gap: 0.45rem;
		font-weight: 700;
		color: var(--text);
		font-size: 1.05rem;
	}
	.brand:hover {
		text-decoration: none;
		color: var(--accent);
	}

	.mark {
		display: block;
		width: 36px;
		height: 36px;
	}

	.repo {
		font-family: var(--mono);
		font-size: 0.85rem;
		color: var(--text-dim);
		border-left: 1px solid var(--border);
		padding-left: 0.75rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 0 1 auto;
		min-width: 0;
	}

	.save-repo {
		margin-left: -0.35rem;
		flex-shrink: 0;
	}

	.spacer {
		flex: 1;
	}

	.conn {
		flex-shrink: 0;
		padding: 0.4rem;
		border: none;
		background: none;
		color: var(--text-dim);
	}
	.conn:hover {
		color: var(--accent);
	}
	.conn.syncing {
		cursor: progress;
	}
	.conn.offline {
		color: var(--warn);
	}

	.nav {
		font-size: 0.9rem;
		color: var(--text-dim);
	}
	.nav:hover {
		color: var(--accent);
	}
	.settings {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
	}

	.burger {
		display: none;
		line-height: 0;
		padding: 0.4rem;
		margin-left: -0.4rem;
	}
	.burger svg path {
		transform-box: view-box;
		transform-origin: center;
		transition:
			transform 0.2s ease,
			opacity 0.15s ease;
	}
	.burger.open .bar-top {
		transform: translateY(4.5px) rotate(45deg);
	}
	.burger.open .bar-mid {
		opacity: 0;
	}
	.burger.open .bar-bot {
		transform: translateY(-4.5px) rotate(-45deg);
	}
	@media (prefers-reduced-motion: reduce) {
		.burger svg path {
			transition: none;
		}
	}

	@media (max-width: 860px) {
		.burger {
			display: inline-flex;
		}
	}

	main {
		flex: 1;
		padding: 1.5rem 1rem 2.5rem;
		width: 100%;
	}
</style>
