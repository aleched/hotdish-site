<script lang="ts">
	import { themeStore, THEME_ACCENTS, THEME_MODES } from '$lib/store/theme.svelte';
	import { clearBlobCache } from '$lib/cache/blobCache';
	import { historyStore } from '$lib/store/history.svelte';
	import { editorPrefs } from '$lib/store/editorPrefs.svelte';

	let cacheMessage = $state<string | null>(null);

	async function emptyCache() {
		await clearBlobCache();
		historyStore.reset();
		cacheMessage = 'Cached recipe content cleared.';
		setTimeout(() => (cacheMessage = null), 3000);
	}
</script>

<svelte:head>
	<title>Settings — Hotdish</title>
</svelte:head>

<h1>Settings</h1>

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
	<h2>Editor</h2>
	<div class="card stack">
		<label class="toggle">
			<input
				type="checkbox"
				checked={editorPrefs.fractions}
				onchange={(event) => editorPrefs.setFractions(event.currentTarget.checked)}
			/>
			<span>Replace typed fractions with symbols (3/4 → ¾)</span>
		</label>
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

<section class="panel">
	<h2>About</h2>
	<div class="card stack">
		<p class="muted">
			Hotdish renders recipes from a GitHub, GitLab or Gitea repository of markdown files, right
			in your browser. No account, server or database.
		</p>
		<ul class="muted about-list">
			<li>
				<strong>Your files stay yours.</strong> Recipes are plain markdown with YAML frontmatter,
				so the repository works without this site.
			</li>
			<li>
				<strong>Tokens stay local.</strong> They are stored in this browser's
				<code>localStorage</code>, sent only to their forge, and never placed in a URL. On a shared
				computer, leave the token blank or remove it when done.
			</li>
			<li>
				<strong>Sharing is public only.</strong> Share links hold just the repository and path, so
				private repositories can't be shared.
			</li>
			<li>
				<strong>Optional templates.</strong> Add <code>.hotdish/template.yml</code> for structured
				editing and a fixed set of tags. Copy the
				<a href="/template.example.yml" target="_blank" rel="noopener">example template</a> to get
				started.
			</li>
			<li>
				<strong>API rate limits apply.</strong> Forges cap requests per hour. GitHub allows about
				60 per hour without a token and 5,000 with one, and GitLab and Gitea set their own limits.
				Large repositories or heavy browsing can hit them, so add an access token if you see
				rate-limit errors. Caching reduces repeat requests.
			</li>
		</ul>
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

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.label {
		font-size: 0.85rem;
		font-weight: 600;
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}
	.toggle input {
		width: auto;
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

	.about-list {
		margin: 0;
		padding-left: 1.1rem;
		font-size: 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
</style>
