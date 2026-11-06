import { GiteaProvider } from './gitea';
import { GitHubProvider } from './github';
import { GitLabProvider } from './gitlab';
import type { ForgeKind, ForgeProvider, RepoRef } from './types';
import { m } from '$lib/paraglide/messages.js';

export function createProvider(ref: RepoRef, token?: string): ForgeProvider {
	switch (ref.kind) {
		case 'github':
			return new GitHubProvider(ref, token);
		case 'gitlab':
			return new GitLabProvider(ref, token);
		case 'gitea':
			return new GiteaProvider(ref, token);
	}
}

export const FORGE_LABELS: Record<ForgeKind, string> = {
	github: 'GitHub',
	gitlab: 'GitLab',
	gitea: 'Gitea / Forgejo'
};

export const TOKEN_GUIDANCE: Record<ForgeKind, string> = {
	github: m.token_guidance_github(),
	gitlab: m.token_guidance_gitlab(),
	gitea: m.token_guidance_gitea()
};
