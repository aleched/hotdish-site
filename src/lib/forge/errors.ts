import { knownForgeKind } from './parse';
import { m } from '#lib/paraglide/messages.js';
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
	const selfHosted = !knownForgeKind(host);
	const hint = selfHosted
		? m.error_network_self_hosted({ host, admin: kind === 'gitea' ? 'Gitea' : m.error_network_server() })
		: m.error_network_hosted({ host });
	return new ForgeError('network', m.error_network({ host }), { hint });
}

export function describeForgeError(error: unknown): { message: string; hint?: string } {
	if (error instanceof ForgeError) {
		return { message: error.message, hint: error.hint };
	}
	if (error instanceof Error) return { message: error.message };
	return { message: String(error) };
}
