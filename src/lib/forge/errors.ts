import type { ForgeKind } from './types';

export type ForgeErrorKind =
	| 'network'
	| 'auth'
	| 'not-found'
	| 'rate-limit'
	| 'conflict'
	| 'invalid'
	| 'unknown';

export class ForgeError extends Error {
	readonly kind: ForgeErrorKind;
	readonly status?: number;
	readonly hint?: string;

	constructor(kind: ForgeErrorKind, message: string, options?: { status?: number; hint?: string }) {
		super(message);
		this.name = 'ForgeError';
		this.kind = kind;
		this.status = options?.status;
		this.hint = options?.hint;
	}
}

/**
 * A browser cannot distinguish "server unreachable" from "CORS rejected" — both surface as a
 * TypeError. Self-hosted Gitea disables API CORS by default, so that is the likeliest cause
 * for non-hosted instances and worth calling out explicitly.
 */
export function networkError(kind: ForgeKind, host: string): ForgeError {
	const selfHosted = !['github.com', 'gitlab.com', 'codeberg.org'].includes(host);
	const hint = selfHosted
		? `Could not reach ${host}. If this is a self-hosted instance, its API may not allow browser requests (CORS). A ${kind === 'gitea' ? 'Gitea' : 'server'} admin can enable it — for Gitea, set ALLOW_DOMAIN in the [cors] section of app.ini.`
		: `Could not reach ${host}. Check your connection and try again.`;
	return new ForgeError('network', `Network request to ${host} failed.`, { hint });
}

export function describeForgeError(error: unknown): { message: string; hint?: string } {
	if (error instanceof ForgeError) {
		return { message: error.message, hint: error.hint };
	}
	if (error instanceof Error) return { message: error.message };
	return { message: String(error) };
}
