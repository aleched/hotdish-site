<script lang="ts">
	import { themeStore, THEME_ACCENTS, THEME_MODES } from '$lib/store/theme.svelte';
	import { clearBlobCache } from '$lib/cache/blobCache';
	import { historyStore } from '$lib/store/history.svelte';
	import { editorPrefs } from '$lib/store/editorPrefs.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import { FRACTIONS } from '$lib/editor/fractions';

	const MODE_ICONS = { system: 'monitor', light: 'sun', dark: 'moon' } as const;

	let cacheMessage = $state<string | null>(null);
	let confirmingCache = $state(false);

	async function emptyCache() {
		confirmingCache = false;
		await clearBlobCache();
		historyStore.reset();
		cacheMessage = 'Cleared';
		setTimeout(() => (cacheMessage = null), 3000);
	}
</script>

<svelte:head>
	<title>Settings — Hotdish</title>
</svelte:head>

<h1 class="visually-hidden">Settings</h1>

<section class="panel">
	<h2 title="Theme"><Icon name="palette" size={20} /><span class="visually-hidden">Theme</span></h2>
	<div class="card theme">
		<div class="split" role="radiogroup" aria-label="Appearance">
			{#each THEME_MODES as mode (mode)}
				<button
					type="button"
					role="radio"
					aria-checked={themeStore.mode === mode}
					aria-label={mode[0].toUpperCase() + mode.slice(1)}
					title={mode[0].toUpperCase() + mode.slice(1)}
					class="part"
					class:selected={themeStore.mode === mode}
					onclick={() => themeStore.setMode(mode)}
				>
					<Icon name={MODE_ICONS[mode]} size={18} />
				</button>
			{/each}
		</div>
		<div class="split" role="radiogroup" aria-label="Accent color">
			{#each THEME_ACCENTS as accent (accent.id)}
				<button
					type="button"
					role="radio"
					aria-checked={themeStore.accent === accent.id}
					aria-label={accent.label}
					title={accent.label}
					class="part"
					class:selected={themeStore.accent === accent.id}
					onclick={() => themeStore.setAccent(accent.id)}
				>
					<span class="swatch" style:background={accent.color}></span>
					<span class="emoji" aria-hidden="true">{accent.emoji}</span>
				</button>
			{/each}
		</div>
	</div>
</section>

<section class="panel">
	<h2 title="Editor"><Icon name="edit" size={20} /><span class="visually-hidden">Editor</span></h2>
	<div class="card stack">
		<label class="switch" title="Replace typed fractions with symbols">
			<input
				type="checkbox"
				role="switch"
				aria-label="Replace typed fractions with symbols"
				checked={editorPrefs.fractions}
				onchange={(event) => editorPrefs.setFractions(event.currentTarget.checked)}
			/>
			<span class="track" aria-hidden="true"><span class="thumb"></span></span>
			<span>3/4 → ¾</span>
		</label>
		<ul class="fraction-preview" aria-label="Fraction preview">
			{#each Object.entries(FRACTIONS) as [typed, symbol] (typed)}
				<li>{editorPrefs.fractions ? symbol : typed}</li>
			{/each}
		</ul>
	</div>
</section>

<section class="panel">
	<h2 title="Cache"><Icon name="cache" size={20} /><span class="visually-hidden">Cache</span></h2>
	<div class="card row cache">
		{#if confirmingCache}
			<span class="confirm-text">Clear cached recipes?</span>
			<div class="split">
				<button
					type="button"
					class="part"
					title="Cancel"
					aria-label="Cancel"
					onclick={() => (confirmingCache = false)}
				>
					<Icon name="cancel" />
				</button>
				<button
					type="button"
					class="part danger-part"
					title="Confirm clear cache"
					aria-label="Confirm clear cache"
					onclick={emptyCache}
				>
					<Icon name="trash" />
				</button>
			</div>
		{:else}
			<button
				type="button"
				title="Clear cached recipe content (safe; it only costs a few extra requests)"
				onclick={() => (confirmingCache = true)}
			>
				<Icon name="trash" /> Clear cache
			</button>
		{/if}
		{#if cacheMessage}<span class="muted" role="status">{cacheMessage}</span>{/if}
	</div>
</section>

<section class="panel">
	<h2 title="About"><Icon name="info" size={20} /><span class="visually-hidden">About</span></h2>
	<div class="card stack">
		<p class="muted">
			Recipes from a GitHub, GitLab or Gitea repository, rendered in your browser. No account,
			server or database.
		</p>
		<ul class="muted about-list">
			<li>
				<Icon name="file" />
				<span>Recipes are plain markdown with YAML frontmatter, so your repository works without this site.</span>
			</li>
			<li>
				<Icon name="key" />
				<span>
					Tokens stay in this browser's <code>localStorage</code> and are sent only to their forge.
					On a shared computer, leave the token blank or remove it when done.
				</span>
			</li>
			<li>
				<Icon name="link" />
				<span>Share links hold only the repository and path, so private repositories can't be shared.</span>
			</li>
			<li>
				<Icon name="form" />
				<span>
					Add <code>.hotdish/template.yml</code> for structured editing and fixed tags
					(<a href="/template.example.yml" target="_blank" rel="noopener">example</a>).
				</span>
			</li>
			<li>
				<Icon name="clock" />
				<span>
					Forges limit API requests per hour (GitHub: about 60 without a token, 5,000 with one). Add
					a token if you see rate-limit errors.
				</span>
			</li>
		</ul>
	</div>
</section>

<style>
	h2 {
		display: flex;
		align-items: center;
		font-size: 1rem;
		margin-bottom: 0.5rem;
	}

	.panel {
		margin-bottom: 1.5rem;
	}

	.theme {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1.5rem;
	}
	.cache {
		align-items: center;
	}
	.cache button {
		display: inline-flex;
		align-items: center;
		box-sizing: border-box;
		height: calc(1.6rem + 0.9rem + 2px);
		gap: 0.4rem;
	}
	.switch {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		cursor: pointer;
		position: relative;
		align-self: flex-start;
	}
	.switch input {
		position: absolute;
		opacity: 0;
		width: 2.4rem;
		height: 1.3rem;
		margin: 0;
		cursor: pointer;
	}
	.track {
		width: 2.4rem;
		height: 1.3rem;
		border-radius: 999px;
		background: var(--border);
		position: relative;
		transition: background 0.15s;
		flex: none;
	}
	.thumb {
		position: absolute;
		top: 0.15rem;
		left: 0.15rem;
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		background: var(--surface);
		transition: transform 0.15s;
	}
	.switch input:checked + .track {
		background: var(--accent);
	}
	.switch input:checked + .track .thumb {
		transform: translateX(1.1rem);
	}
	.switch input:focus-visible + .track {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.fraction-preview {
		list-style: none;
		margin: 0;
		padding: 0.6rem 0.75rem;
		display: grid;
		grid-template-columns: repeat(auto-fill, 3.5rem);
		gap: 0.4rem 0.75rem;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: 0.95rem;
	}
	.fraction-preview li {
		text-align: left;
		white-space: nowrap;
	}
	.confirm-text {
		font-size: 0.9rem;
	}

	.split {
		display: inline-flex;
	}
	.part {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		width: auto;
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
	.part:hover {
		text-decoration: none;
		border-color: var(--accent);
		position: relative;
	}
	.part.selected {
		border-color: var(--accent);
		color: var(--accent);
		position: relative;
	}
	.part.danger-part {
		border-color: var(--danger);
		color: var(--danger);
		position: relative;
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
	.emoji {
		line-height: 1;
	}
	.swatch {
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 50%;
		display: inline-block;
	}

	.about-list {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.about-list li {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
	}
	.about-list li :global(svg) {
		flex: none;
		margin-top: 0.25em;
	}
</style>
