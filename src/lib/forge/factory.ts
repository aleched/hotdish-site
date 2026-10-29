import { GiteaProvider } from './gitea';
import { GitHubProvider } from './github';
import { GitLabProvider } from './gitlab';
import type { ForgeKind, ForgeProvider, RepoRef } from './types';

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

export const DEFAULT_HOSTS: Record<ForgeKind, string> = {
	github: 'github.com',
	gitlab: 'gitlab.com',
	gitea: 'codeberg.org'
};

export const TOKEN_GUIDANCE: Record<ForgeKind, string> = {
	github:
		'Use a fine-grained personal access token scoped to this one repository, with Contents: Read (or Read and write to edit), and set an expiry.',
	gitlab:
		'Use a project access token with read_repository scope (or write_repository to edit), and set an expiry.',
	gitea: 'Use a token limited to repository read (or write, to edit) and set an expiry.'
};
