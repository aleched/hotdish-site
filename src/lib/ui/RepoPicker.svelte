<script lang="ts">
	import { goto } from '$app/navigation';
	import { DEFAULT_HOSTS, FORGE_LABELS } from '$lib/forge/factory';
	import { parseRepoInput } from '$lib/forge/parse';
	import type { ForgeKind } from '$lib/forge/types';
	import { encodeSrc } from '$lib/share/codec';
	import { profileStore } from '$lib/store/profiles.svelte';

	let input = $state('');
	let kind = $state<ForgeKind>('github');
	let error = $state<string | null>(null);

	const kinds: ForgeKind[] = ['github', 'gitlab', 'gitea'];

	function open(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		try {
			const ref = parseRepoInput(input, { fallbackKind: kind });
			void goto(`/r/${encodeSrc(ref)}`);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		}
	}
</script>

<form class="picker card" onsubmit={open}>
	<label class="field">
		<span class="label">Repository</span>
		<input
			type="text"
			bind:value={input}
			placeholder="https://github.com/alice/recipes or alice/recipes"
			autocomplete="off"
			spellcheck="false"
		/>
	</label>

	<fieldset class="kinds">
		<legend class="visually-hidden">Forge</legend>
		{#each kinds as option (option)}
			<label class="kind" class:selected={kind === option}>
				<input type="radio" value={option} bind:group={kind} />
				<span>{FORGE_LABELS[option]}</span>
			</label>
		{/each}
	</fieldset>

	<p class="muted hint">
		Used when the URL alone is ambiguous. Default host: <code>{DEFAULT_HOSTS[kind]}</code>
	</p>

	{#if error}
		<p class="banner error" role="alert">{error}</p>
	{/if}

	<button class="primary" type="submit" disabled={!input.trim()}>Open recipes</button>
</form>

{#if profileStore.profiles.length > 0}
	<section class="saved">
		<h2>Saved repositories</h2>
		<ul>
			{#each profileStore.profiles as profile (profile.id)}
				<li>
					<a
						class="card profile"
						href={`/r/${encodeSrc({
							kind: profile.kind,
							host: profile.host,
							owner: profile.owner,
							repo: profile.repo,
							ref: profile.ref,
							basePath: profile.basePath
						})}`}
					>
						<strong>{profile.name}</strong>
						<span class="muted path">{profile.owner}/{profile.repo}</span>
						<span class="meta">
							<span class="tag">{FORGE_LABELS[profile.kind]}</span>
							{#if profile.token}<span class="tag">token saved</span>{/if}
							{#if profile.ref}<span class="tag">{profile.ref}</span>{/if}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-width: 640px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.label {
		font-size: 0.85rem;
		font-weight: 600;
	}

	.kinds {
		display: flex;
		gap: 0.4rem;
		border: none;
		padding: 0;
		margin: 0;
	}

	.kind {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0.2rem 0.7rem;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.kind.selected {
		border-color: var(--accent);
		color: var(--accent);
	}
	.kind input {
		width: auto;
		margin: 0;
	}

	.hint {
		font-size: 0.8rem;
		margin: 0;
	}

	.saved {
		margin-top: 2rem;
		max-width: 640px;
	}
	.saved h2 {
		font-size: 1rem;
	}
	.saved ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.profile {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		color: var(--text);
	}
	.profile:hover {
		text-decoration: none;
		border-color: var(--accent);
	}
	.path {
		font-family: var(--mono);
		font-size: 0.8rem;
	}
	.meta {
		display: flex;
		gap: 0.3rem;
		margin-top: 0.3rem;
		flex-wrap: wrap;
	}
</style>
