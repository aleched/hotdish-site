<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { repoStore } from '$lib/store/repo.svelte';

	let { children } = $props();

	let activeSrc = $derived($page.params.src ?? null);
	let repoName = $derived(repoStore.ref ? `${repoStore.ref.owner}/${repoStore.ref.repo}` : null);
</script>

<svelte:head>
	<title>Hotdish</title>
	<meta name="description" content="Browse, search and edit recipes stored as markdown in a git repository." />
</svelte:head>

<div class="shell">
	<header class="no-print">
		<div class="container bar">
			<a class="brand" href="/">
				<span class="mark" aria-hidden="true">🥘</span>
				<span>Hotdish</span>
			</a>

			{#if repoName && activeSrc}
				<a class="repo" href={`/r/${activeSrc}`} title="Browse this repository">{repoName}</a>
			{/if}

			<div class="spacer"></div>
			<a class="nav" href="/settings">Settings</a>
		</div>
	</header>

	<main class="container">
		{@render children()}
	</main>

	<footer class="container no-print">
		<p class="muted">
			Recipes are read directly from your git repository. Nothing is stored on a server.
		</p>
	</footer>
</div>

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
		font-size: 1.25rem;
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
		max-width: 40vw;
	}

	.spacer {
		flex: 1;
	}

	.nav {
		font-size: 0.9rem;
		color: var(--text-dim);
	}
	.nav:hover {
		color: var(--accent);
	}

	main {
		flex: 1;
		padding: 1.5rem 1rem 2.5rem;
		width: 100%;
	}

	footer {
		padding: 1rem;
		border-top: 1px solid var(--border);
	}
	footer p {
		margin: 0;
		font-size: 0.8rem;
	}
</style>
