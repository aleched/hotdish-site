import { trimSlashes } from '#lib/share/codec.ts';
import { m } from '#lib/paraglide/messages.js';
import type { ForgeKind, RepoRef } from './types';

const KNOWN_HOSTS: Record<string, ForgeKind> = {
	'github.com': 'github',
	'www.github.com': 'github',
	'gitlab.com': 'gitlab',
	'www.gitlab.com': 'gitlab',
	'codeberg.org': 'gitea'
};

export interface ParseOptions {
	/** Used when the input is a bare `owner/repo` or the host is unknown. */
	fallbackKind?: ForgeKind;
}

export function knownForgeKind(host: string): ForgeKind | undefined {
	const hostname = host.toLowerCase().replace(/:\d+$/, '');
	return KNOWN_HOSTS[hostname];
}

/**
 * Accepts a browser URL copied from a forge, or a bare `owner/repo` slug, and extracts the
 * repository identity plus any branch and sub-folder embedded in the URL.
 */
export function parseRepoInput(input: string, options: ParseOptions = {}): RepoRef {
	const raw = input.trim();
	if (!raw) throw new Error(m.error_repo_input_empty());

	if (!/^[a-z]+:\/\//i.test(raw)) {
		const segments = trimSlashes(raw).split('/').filter(Boolean);
		if (segments.length < 2) {
			throw new Error(m.error_repo_input_short());
		}
		const kind = options.fallbackKind ?? 'github';
		return {
			kind,
			host: kind === 'gitlab' ? 'gitlab.com' : kind === 'gitea' ? 'codeberg.org' : 'github.com',
			owner: segments[0],
			repo: segments[1].replace(/\.git$/, '')
		};
	}

	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error(m.error_url_invalid());
	}

	const host = url.host;
	const kind = knownForgeKind(url.hostname) ?? options.fallbackKind ?? 'gitea';
	const segments = trimSlashes(url.pathname).split('/').filter(Boolean);
	if (segments.length < 2) throw new Error(m.error_url_no_repo());

	const owner = segments[0];
	const repo = segments[1].replace(/\.git$/, '');
	const rest = segments.slice(2);

	const { ref, basePath } = extractRefAndPath(kind, rest);
	return { kind, host, owner, repo, ref, basePath };
}

function extractRefAndPath(
	kind: ForgeKind,
	segments: string[]
): { ref?: string; basePath?: string } {
	if (segments.length === 0) return {};

	// GitLab nests repository browsing under `/-/`, e.g. /owner/repo/-/tree/main/folder
	const cleaned = kind === 'gitlab' && segments[0] === '-' ? segments.slice(1) : segments;
	if (cleaned.length === 0) return {};

	const marker = cleaned[0];
	const browsing = ['tree', 'blob', 'src', 'raw'].includes(marker);
	if (!browsing) return {};

	let remainder = cleaned.slice(1);
	// Gitea uses /src/branch/<name>/... and /src/commit/<sha>/...
	if (remainder.length > 1 && ['branch', 'commit', 'tag'].includes(remainder[0])) {
		remainder = remainder.slice(1);
	}
	if (remainder.length === 0) return {};

	const ref = decodeURIComponent(remainder[0]);
	const pathSegments = remainder.slice(1).map((segment) => decodeURIComponent(segment));
	const basePath = pathSegments.length ? pathSegments.join('/') : undefined;

	// A link to a specific file points at its folder for browsing purposes.
	if (basePath && marker === 'blob') {
		const parent = basePath.split('/').slice(0, -1).join('/');
		return { ref, basePath: parent || undefined };
	}

	return { ref, basePath };
}
