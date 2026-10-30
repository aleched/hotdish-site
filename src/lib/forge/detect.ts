import { knownForgeKind } from './parse';
import type { ForgeKind } from './types';

const PROBE_TIMEOUT_MS = 4000;

/**
 * Infers a self-hosted forge from its public version endpoints. A null result means the
 * endpoints were unavailable, blocked, or did not provide an unambiguous forge signature.
 */
export async function detectForgeKind(host: string): Promise<ForgeKind | null> {
	const knownKind = knownForgeKind(host);
	if (knownKind) return knownKind;

	let origin: string;
	try {
		origin = new URL(`https://${host}`).origin;
	} catch {
		return null;
	}

	const [github, gitlab, gitea] = await Promise.all([
		probe(`${origin}/api/v3/meta`, (body) => hasString(body, 'installed_version')),
		probe(
			`${origin}/api/v4/version`,
			(body) => hasString(body, 'version') && hasString(body, 'revision')
		),
		probe(`${origin}/api/v1/version`, (body) => hasString(body, 'version'))
	]);

	const matches: ForgeKind[] = [];
	if (github) matches.push('github');
	if (gitlab) matches.push('gitlab');
	if (gitea) matches.push('gitea');
	return matches.length === 1 ? matches[0] : null;
}

async function probe(
	url: string,
	matches: (body: Record<string, unknown>) => boolean
): Promise<boolean> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			headers: { Accept: 'application/json' },
			signal: controller.signal
		});
		if (!response.ok) return false;
		const body: unknown = await response.json();
		return isRecord(body) && matches(body);
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasString(body: Record<string, unknown>, key: string): boolean {
	return typeof body[key] === 'string' && body[key].length > 0;
}
