import type { ForgeKind } from '#lib/forge/types.ts';

export const EXAMPLE_REPO = { kind: 'github', host: 'github.com', owner: 'aleched', repo: 'recipes' } as const;

export const EXAMPLE_FORK_URL = `https://${EXAMPLE_REPO.host}/${EXAMPLE_REPO.owner}/${EXAMPLE_REPO.repo}/fork`;

/** Page on the forge where the user creates a personal access token. */
export function tokenCreateUrl(kind: ForgeKind, host: string): string {
	switch (kind) {
		case 'github':
			return `https://${host}/settings/personal-access-tokens/new`;
		case 'gitlab':
			return `https://${host}/-/user_settings/personal_access_tokens`;
		case 'gitea':
			return `https://${host}/user/settings/applications`;
	}
}
