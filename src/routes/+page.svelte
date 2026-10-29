<script lang="ts">
	import RepoPicker from '$lib/ui/RepoPicker.svelte';
</script>

<svelte:head>
	<title>Hotdish — recipes from any git repository</title>
</svelte:head>

<section class="hero">
	<h1>Recipes, straight from your repository.</h1>
	<p class="lede">
		Point Hotdish at a GitHub, GitLab or Gitea repository of markdown files. It mirrors your
		folder structure, indexes your tags, and renders everything in the browser. No account, no
		server, no database.
	</p>
</section>

<RepoPicker />

<section class="notes">
	<div class="card">
		<h2>Your files stay yours</h2>
		<p class="muted">
			Recipes are plain markdown with YAML frontmatter. Hotdish reads and writes the same files
			you would edit by hand, so the repository works perfectly well without this site.
		</p>
	</div>
	<div class="card">
		<h2>Sharing is public only</h2>
		<p class="muted">
			A share link contains just the repository and path, never an access token. Private
			repositories can be browsed on your own device but cannot be shared.
		</p>
	</div>
	<div class="card">
		<h2>Optional templates</h2>
		<p class="muted">
			Add <code>.hotdish/template.yml</code> to your repository to get structured editing boxes
			and a fixed set of tags. Without one, everything still works as generic markdown.
		</p>
	</div>
</section>

<style>
	.hero {
		max-width: 640px;
		margin-bottom: 1.5rem;
	}
	h1 {
		font-size: clamp(1.6rem, 4vw, 2.2rem);
		margin: 0 0 0.5rem;
		line-height: 1.2;
	}
	.lede {
		color: var(--text-dim);
		margin: 0;
	}

	.notes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 0.75rem;
		margin-top: 2.5rem;
	}
	.notes h2 {
		font-size: 0.95rem;
		margin: 0 0 0.35rem;
	}
	.notes p {
		margin: 0;
		font-size: 0.9rem;
	}
</style>
