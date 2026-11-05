<script lang="ts">
	import { themeStore, THEME_ACCENTS, THEME_MODES } from '$lib/store/theme.svelte';
	import { clearBlobCache } from '$lib/cache/blobCache';
	import { historyStore } from '$lib/store/history.svelte';
	import { editorPrefs, EDITOR_MODES } from '$lib/store/editorPrefs.svelte';
	import ModeToggle from '$lib/ui/ModeToggle.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import { FRACTIONS } from '$lib/editor/fractions';

	const PREVIEW_FRACTIONS = ['1/2', '2/3', '3/4'];

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

<section class="card stack panel">
	<div class="theme">
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

	<hr />

	<div class="settings">
		<div class="setting">
			<span>Default editor</span>
			<span class="control">
				<ModeToggle
					items={EDITOR_MODES}
					value={editorPrefs.defaultMode}
					label="Default editing mode"
					onselect={(mode) => editorPrefs.setDefaultMode(mode)}
				/>
			</span>
		</div>
		<label class="setting switch" title="Browser spellcheck in the form, rich text and markdown editors">
			<span>Spellcheck</span>
			<span class="control">
				<span class="toggle">
					<input
						type="checkbox"
						role="switch"
						aria-label="Spellcheck"
						checked={editorPrefs.spellcheck}
						onchange={(event) => editorPrefs.setSpellcheck(event.currentTarget.checked)}
					/>
					<span class="track" aria-hidden="true"><span class="thumb"></span></span>
				</span>
			</span>
		</label>
		<label class="setting switch" title="Replace typed fractions with symbols">
			<span>Auto fractions</span>
			<span class="control">
				<span class="toggle">
					<input
						type="checkbox"
						role="switch"
						aria-label="Replace typed fractions with symbols"
						checked={editorPrefs.fractions}
						onchange={(event) => editorPrefs.setFractions(event.currentTarget.checked)}
					/>
					<span class="track" aria-hidden="true"><span class="thumb"></span></span>
				</span>
				<ul class="fraction-preview" aria-label="Fraction preview">
					{#each PREVIEW_FRACTIONS as typed (typed)}
						<li>{editorPrefs.fractions ? FRACTIONS[typed] : typed}</li>
					{/each}
				</ul>
			</span>
		</label>
	</div>

	<hr />

	<div class="cache">
		<button
			type="button"
			class="clear"
			class:confirming={confirmingCache}
			title={confirmingCache
				? 'Click again to clear the cache'
				: 'Clear cached recipe content (safe; it only costs a few extra requests)'}
			onclick={() => (confirmingCache ? emptyCache() : (confirmingCache = true))}
			onblur={() => (confirmingCache = false)}
		>
			<Icon name="trash" />
			<!-- Both labels share one grid cell so the button keeps its size when the text swaps. -->
			<span class="labels">
				<span class:hidden={confirmingCache}>Clear cache</span>
				<span class:hidden={!confirmingCache}>Confirm clear?</span>
			</span>
		</button>
		{#if cacheMessage}<span class="muted cleared" role="status" title={cacheMessage} aria-label={cacheMessage}><Icon name="check" /></span>{/if}
	</div>
</section>

<section class="card stack panel">
	<div class="stack">
		<p class="muted intro">
			<span class="corner" title="About"><Icon name="info" size={20} /><span class="visually-hidden">About</span></span>
			<span>Recipes from a GitHub, GitLab or Gitea repository, rendered in your browser. No account,
			server or database.</span>
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
	.corner {
		display: inline-flex;
		flex: none;
		color: var(--text-dim);
	}
	.intro {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		margin: 0;
	}
	.toggle {
		position: relative;
		display: inline-flex;
	}
	hr {
		width: 100%;
		margin: 0.25rem 0;
		border: none;
		border-top: 1px solid var(--border);
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
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.cache button {
		display: inline-flex;
		align-items: center;
		box-sizing: border-box;
		height: calc(1.6rem + 0.9rem + 2px);
		gap: 0.4rem;
	}
	.labels {
		display: inline-grid;
	}
	.labels > span {
		grid-area: 1 / 1;
	}
	.labels > .hidden {
		visibility: hidden;
	}
	.cache button.clear.confirming {
		background: var(--danger);
		border-color: var(--danger);
		color: #fff;
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
	.settings {
		display: grid;
		grid-template-columns: max-content 1fr;
		align-items: center;
		gap: 1rem 1rem;
	}
	.settings > .setting {
		display: contents;
	}
	.control {
		display: inline-flex;
		align-items: center;
		justify-self: start;
		gap: 0.75rem;
	}
	.fraction-preview {
		list-style: none;
		margin: 0;
		padding: 0 0.75rem;
		box-sizing: border-box;
		/* Matches the mode toggle: 1.9rem buttons + 2px padding + 1px border on each side. */
		height: calc(1.9rem + 6px);
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: 0.95rem;
	}
	.fraction-preview li {
		text-align: left;
		white-space: nowrap;
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
