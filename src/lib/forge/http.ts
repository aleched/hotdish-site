import { rateLimitStore } from '$lib/store/rateLimit.svelte';
import { m } from '$lib/paraglide/messages.js';
import { ForgeError, networkError } from './errors';
import { readInt, readRateLimit } from './rateLimitHeaders';
import type { ForgeKind } from './types';

export interface ForgeRequestContext {
	kind: ForgeKind;
	host: string;
	/** Called with every response so providers can track rate limit headers. */
	onResponse?: (response: Response) => void;
}

/** Performs a fetch and normalizes transport and HTTP failures into ForgeError. */
export async function forgeFetch(
	url: string,
	init: RequestInit,
	ctx: ForgeRequestContext
): Promise<Response> {
	let response: Response;
	try {
		response = await fetch(url, init);
	} catch {
		throw networkError(ctx.kind, ctx.host);
	}

	ctx.onResponse?.(response);

	if (response.ok) return response;

	const body = await response.text().catch(() => '');
	const detail = extractMessage(body) ?? response.statusText;

	if (response.status === 401) {
		throw new ForgeError('auth', m.error_auth({ detail }), {
			status: 401,
			hint: m.error_auth_hint()
		});
	}

	if (response.status === 403 || response.status === 429) {
		const remaining = readInt(response.headers, 'x-ratelimit-remaining');
		if (remaining === 0 || response.status === 429) {
			rateLimitStore.report({
				kind: ctx.kind,
				host: ctx.host,
				resetAt: readRateLimit(response.headers)?.resetAt ?? null
			});
			throw new ForgeError('rate-limit', m.error_rate_limit(), {
				status: response.status,
				hint: m.error_rate_limit_hint()
			});
		}
		throw new ForgeError('auth', m.error_denied({ detail }), {
			status: 403,
			hint: m.error_denied_hint()
		});
	}

	if (response.status === 404) {
		throw new ForgeError('not-found', m.error_not_found({ detail }), {
			status: 404,
			hint: m.error_not_found_hint()
		});
	}

	if (response.status === 409 || response.status === 412) {
		throw new ForgeError('conflict', m.error_conflict(), {
			status: response.status,
			hint: m.error_conflict_hint()
		});
	}

	if (response.status === 422) {
		throw new ForgeError('invalid', m.error_rejected({ detail }), { status: 422 });
	}

	throw new ForgeError('unknown', m.error_failed({ status: response.status, detail }), {
		status: response.status
	});
}

export async function forgeFetchJson<T>(
	url: string,
	init: RequestInit,
	ctx: ForgeRequestContext
): Promise<T> {
	const response = await forgeFetch(url, init, ctx);
	return (await response.json()) as T;
}

function extractMessage(body: string): string | null {
	if (!body) return null;
	try {
		const parsed = JSON.parse(body) as { message?: string; error?: string };
		return parsed.message ?? parsed.error ?? null;
	} catch {
		return body.slice(0, 200);
	}
}
