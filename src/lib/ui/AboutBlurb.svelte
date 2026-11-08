<script lang="ts">
	import Icon from '#lib/ui/Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { EXAMPLE_FORK_URL } from '#lib/forge/example.ts';

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
</script>

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
<p class="muted start-own"><a href={EXAMPLE_FORK_URL} target="_blank" rel="noopener">{m.home_start_own()}</a></p>

<style>
	.start-own {
		margin: 0;
		font-size: 0.9rem;
	}
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
