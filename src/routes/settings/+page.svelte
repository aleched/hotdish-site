<script lang="ts">
	import { themeStore, THEME_ACCENTS, THEME_MODES } from '$lib/store/theme.svelte';
	import { clearBlobCache } from '$lib/cache/blobCache';
	import { historyStore } from '$lib/store/history.svelte';
	import { strikeStore } from '$lib/store/strikes.svelte';
	import { editorPrefs, EDITOR_MODES, DEFAULT_TEMPLATES, MAX_RECENT_DAYS } from '$lib/store/editorPrefs.svelte';
	import ModeToggle from '$lib/ui/ModeToggle.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import Flag from '$lib/ui/Flag.svelte';
	import { FRACTIONS } from '$lib/editor/fractions';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale, setLocale, languageOptions, nativeName, type Locale } from '$lib/i18n/locales';
	import { ICON_NAMES } from '$lib/ui/icon-names';
	import { tick } from 'svelte';

	let copiedIcon = $state<string | null>(null);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;

	async function copyIconName(name: string) {
		try {
			await navigator.clipboard.writeText(name);
		} catch {
			return;
		}
		copiedIcon = name;
		clearTimeout(copiedTimer);
		copiedTimer = setTimeout(() => (copiedIcon = null), 1200);
	}

	const PREVIEW_FRACTIONS = ['1/2', '2/3', '3/4'];

	const MODE_ICONS = { system: 'monitor', light: 'sun', dark: 'moon' } as const;
	const MODE_LABELS = { system: m.theme_system, light: m.theme_light, dark: m.theme_dark } as const;

	let languageOpen = $state(false);
	let languageQuery = $state('');
	let languageEl = $state<HTMLElement>();
	let languageSearchEl = $state<HTMLInputElement>();
	const EXAMPLE_TEMPLATES: [string, string][] = [
		['Recipe', '/template/recipe.yml'],
		['Note', '/template/note.yml'],
		['Project', '/template/project.yml'],
		['Journal', '/template/journal.yml'],
		['Travel', '/template/travel.yml'],
		['Fitness', '/template/fitness.yml']
	];

	function escapeHtml(value: string): string {
		return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
	}

	const templateLinks = EXAMPLE_TEMPLATES.map(
		([name, href]) => `<a href="${href}" target="_blank" rel="noopener">${escapeHtml(name)}</a>`
	).join(', ');

	const languageResults = $derived(languageOptions(getLocale(), languageQuery));

	async function toggleLanguage() {
		languageOpen = !languageOpen;
		languageQuery = '';
		if (languageOpen) {
			await tick();
			languageSearchEl?.focus();
		}
	}

	function chooseLanguage(locale: Locale) {
		languageOpen = false;
		if (locale !== getLocale()) setLocale(locale);
	}

	function onWindowPointer(e: Event) {
		if (languageOpen && languageEl && !languageEl.contains(e.target as Node)) languageOpen = false;
	}

	function onWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape') languageOpen = false;
	}

	let cacheMessage = $state<string | null>(null);
	let confirmingCache = $state(false);

	// Normalizes the field on blur (change); input also saves so leaving the page mid-edit never loses it.
	let daysEl = $state<HTMLInputElement>();
	function saveDays(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		// type=number ignores maxlength, so trim to 3 digits manually
		if (input.value.length > 3) input.value = input.value.slice(0, 3);
		editorPrefs.setRecentDays(input.valueAsNumber);
	}
	function commitDays() {
		if (daysEl) daysEl.value = String(editorPrefs.recentDays ?? '');
	}

	async function emptyCache() {
		confirmingCache = false;
		await clearBlobCache();
		historyStore.reset();
		strikeStore.reset();
		cacheMessage = m.settings_cache_cleared();
		setTimeout(() => (cacheMessage = null), 3000);
	}
</script>

<svelte:window onpointerdown={onWindowPointer} onkeydown={onWindowKey} />

<svelte:head>
	<title>{m.settings_page_title()}</title>
</svelte:head>

<h1 class="visually-hidden">{m.settings_heading()}</h1>

<section class="card stack panel">
	<div class="theme">
		<div class="language" bind:this={languageEl}>
			<button
				type="button"
				class="lang-trigger"
				aria-haspopup="listbox"
				aria-expanded={languageOpen}
				aria-label={`${m.settings_language()}: ${nativeName(getLocale())}`}
				title={nativeName(getLocale())}
				onclick={toggleLanguage}
			>
				<Flag locale={getLocale()} />
				<span lang={getLocale()}>{nativeName(getLocale())}</span>
			</button>
			{#if languageOpen}
				<div class="lang-menu">
					<input
						type="search"
						class="lang-search"
						placeholder={m.settings_language()}
						aria-label={m.settings_language()}
						bind:value={languageQuery}
						bind:this={languageSearchEl}
						onkeydown={(e) => {
							if (e.key === 'Enter' && languageResults[0]) chooseLanguage(languageResults[0]);
						}}
					/>
					<ul role="listbox" aria-label={m.settings_language()}>
						{#each languageResults as locale (locale)}
							<li role="option" aria-selected={getLocale() === locale}>
								<button
									type="button"
									lang={locale}
									class:selected={getLocale() === locale}
									onclick={() => chooseLanguage(locale)}
								>
									<Flag {locale} />
									<span class="native">{nativeName(locale)}</span>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
		<div class="split" role="radiogroup" aria-label={m.settings_appearance()}>
			{#each THEME_MODES as mode (mode)}
				<button
					type="button"
					role="radio"
					aria-checked={themeStore.mode === mode}
					aria-label={MODE_LABELS[mode]()}
					title={MODE_LABELS[mode]()}
					class="part"
					class:selected={themeStore.mode === mode}
					onclick={() => themeStore.setMode(mode)}
				>
					<Icon name={MODE_ICONS[mode]} size={18} />
				</button>
			{/each}
		</div>
		<div class="split" role="radiogroup" aria-label={m.settings_accent()}>
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
		<div class="setting" title={m.settings_recent_hint()}>
			<span>{m.settings_recent()}</span>
			<span class="control">
				<input
					type="number"
					class="days"
					min="0"
					max={MAX_RECENT_DAYS}
					step="1"
					placeholder="∞"
					aria-label={m.settings_recent_hint()}
					value={editorPrefs.recentDays ?? ''}
					bind:this={daysEl}
					onchange={commitDays}
					oninput={saveDays}
				/>
			</span>
		</div>
		<div class="setting switch" title={m.settings_random_hint()}>
			<span>{m.settings_random()}</span>
			<span class="control">
				<label class="toggle">
					<input
						type="checkbox"
						role="switch"
						aria-label={m.settings_random_label()}
						checked={editorPrefs.randomButton}
						onchange={(event) => editorPrefs.setRandomButton(event.currentTarget.checked)}
					/>
					<span class="track" aria-hidden="true"><span class="thumb"></span></span>
				</label>
				<span class="dice-preview" class:off={!editorPrefs.randomButton} aria-hidden="true"><Icon name="dice" /></span>
			</span>
		</div>
		<div class="setting switch" title={m.settings_strike_hint()}>
			<span>{m.settings_strike()}</span>
			<span class="control">
				<label class="toggle">
					<input
						type="checkbox"
						role="switch"
						aria-label={m.settings_strike_hint()}
						checked={editorPrefs.strikeLists}
						onchange={(event) => editorPrefs.setStrikeLists(event.currentTarget.checked)}
					/>
					<span class="track" aria-hidden="true"><span class="thumb"></span></span>
				</label>
				<span class="strike-preview" class:off={!editorPrefs.strikeLists} aria-hidden="true"><s>abc</s></span>
			</span>
		</div>
		<div class="setting">
			<span>{m.settings_default_editor()}</span>
			<span class="control">
				<ModeToggle
					items={EDITOR_MODES}
					value={editorPrefs.defaultMode}
					label={m.settings_default_editor_label()}
					onselect={(mode) => editorPrefs.setDefaultMode(mode)}
				/>
			</span>
		</div>
		<div class="setting" title={m.settings_default_template_hint()}>
			<span>{m.settings_default_template()}</span>
			<span class="control">
				<ModeToggle
					items={DEFAULT_TEMPLATES}
					value={editorPrefs.defaultTemplate}
					label={m.settings_default_template_label()}
					onselect={(choice) => editorPrefs.setDefaultTemplate(choice)}
				/>
			</span>
		</div>
		<div class="setting switch" title={m.settings_fractions_hint()}>
			<span>{m.settings_fractions()}</span>
			<span class="control">
				<label class="toggle">
					<input
						type="checkbox"
						role="switch"
						aria-label={m.settings_fractions_hint()}
						checked={editorPrefs.fractions}
						onchange={(event) => editorPrefs.setFractions(event.currentTarget.checked)}
					/>
					<span class="track" aria-hidden="true"><span class="thumb"></span></span>
				</label>
				<ul class="fraction-preview" aria-label={m.settings_fractions_preview()}>
					{#each PREVIEW_FRACTIONS as typed (typed)}
						<li>{editorPrefs.fractions ? FRACTIONS[typed] : typed}</li>
					{/each}
				</ul>
			</span>
		</div>
		<div class="setting switch" title={m.settings_spellcheck_hint()}>
			<span>{m.settings_spellcheck()}</span>
			<span class="control">
				<label class="toggle">
					<input
						type="checkbox"
						role="switch"
						aria-label={m.settings_spellcheck()}
						checked={editorPrefs.spellcheck}
						onchange={(event) => editorPrefs.setSpellcheck(event.currentTarget.checked)}
					/>
					<span class="track" aria-hidden="true"><span class="thumb"></span></span>
				</label>
			</span>
		</div>
	</div>

	<hr />

	<div class="cache">
		<button
			type="button"
			class="clear"
			class:confirming={confirmingCache}
			title={confirmingCache ? m.settings_cache_confirm_hint() : m.settings_cache_hint()}
			onclick={() => (confirmingCache ? emptyCache() : (confirmingCache = true))}
			onblur={() => (confirmingCache = false)}
		>
			<Icon name="trash" />
			<!-- Both labels share one grid cell so the button keeps its size when the text swaps. -->
			<span class="labels">
				<span class:hidden={confirmingCache}>{m.settings_cache_clear()}</span>
				<span class:hidden={!confirmingCache}>{m.settings_cache_confirm()}</span>
			</span>
		</button>
		{#if cacheMessage}<span class="muted cleared" role="status" title={cacheMessage} aria-label={cacheMessage}><Icon name="check" /></span>{/if}
	</div>
</section>

<section class="card stack panel">
	<div class="stack">
		<p class="muted intro">
			<span class="corner" title={m.settings_about()}><Icon name="info" size={20} /><span class="visually-hidden">{m.settings_about()}</span></span>
			<span>{m.about_intro()}</span>
		</p>
		<ul class="muted about-list">
			<li>
				<Icon name="file" />
				<span>{m.about_markdown()}</span>
			</li>
			<li>
				<Icon name="key" />
				<span>{@html m.about_tokens()}</span>
			</li>
			<li>
				<Icon name="link" />
				<span>{m.about_share()}</span>
			</li>
			<li>
				<Icon name="clock" />
				<span>{m.about_rate_limit()}</span>
			</li>
			<li>
				<Icon name="cloud" />
				<span>{m.about_offline()}</span>
			</li>
			<li>
				<Icon name="form" />
				<span>{@html m.about_template({ links: templateLinks })}</span>
			</li>
		</ul>
		<details class="icon-gallery">
			<summary class="muted">{m.about_icons()}</summary>
			<ul class="icon-grid">
				{#each ICON_NAMES as name (name)}
					<li>
						<button type="button" class="icon-chip" onclick={() => copyIconName(name)} title={name}>
							<Icon name={copiedIcon === name ? 'check' : name} size={18} />
							<code>{name}</code>
						</button>
					</li>
				{/each}
			</ul>
		</details>
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
		cursor: pointer;
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
	.days {
		width: calc(3ch + 2.5rem);
	}
	.dice-preview {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.3rem;
		box-sizing: border-box;
		height: calc(1.9rem + 6px);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text-dim);
		pointer-events: none;
	}
	.dice-preview.off {
		visibility: hidden;
	}
	.strike-preview {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.3rem;
		box-sizing: border-box;
		height: calc(1.9rem + 6px);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text-dim);
		font-size: 0.85rem;
		pointer-events: none;
	}
	.strike-preview.off {
		visibility: hidden;
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
	.language {
		position: relative;
		max-width: 100%;
	}
	.lang-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0 0.8rem;
		box-sizing: border-box;
		/* Same height as a text input: 1.6 line-height + 0.45rem padding twice + 1px border twice. */
		height: calc(1.6rem + 0.9rem + 2px);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text);
		cursor: pointer;
	}
	.lang-trigger:hover,
	.lang-trigger[aria-expanded='true'] {
		border-color: var(--accent);
	}
	.lang-menu {
		position: absolute;
		z-index: 20;
		top: calc(100% + 4px);
		left: 0;
		min-width: 14rem;
		max-width: 90vw;
		padding: 0.4rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
	}
	.lang-search {
		width: 100%;
		box-sizing: border-box;
		margin-bottom: 0.4rem;
	}
	.lang-menu ul {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 16rem;
		overflow-y: auto;
	}
	.lang-menu li button {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.35rem 0.5rem;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		text-align: left;
		cursor: pointer;
	}
	.lang-menu li button:hover {
		background: var(--surface-2);
	}
	.lang-menu li button.selected {
		color: var(--accent);
	}
	.lang-menu .native {
		color: inherit;
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
	.icon-gallery summary {
		cursor: pointer;
		font-size: 0.9rem;
	}
	.icon-grid {
		list-style: none;
		margin: 0.6rem 0 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
		gap: 0.35rem;
	}
	.icon-chip {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.3rem 0.5rem;
		font-size: 0.8rem;
		text-align: left;
	}
	.icon-chip code {
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
