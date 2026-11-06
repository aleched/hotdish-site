import type { RateLimitInfo } from './types';

export function readRateLimit(headers: Headers): RateLimitInfo | null {
	const limit = readInt(headers, 'x-ratelimit-limit') ?? readInt(headers, 'ratelimit-limit');
	const remaining =
		readInt(headers, 'x-ratelimit-remaining') ?? readInt(headers, 'ratelimit-remaining');
	if (limit === null && remaining === null) return null;

	const resetRaw = readInt(headers, 'x-ratelimit-reset') ?? readInt(headers, 'ratelimit-reset');
	let resetAt: Date | null = null;
	if (resetRaw !== null) {
		// GitHub reports an epoch timestamp; GitLab reports either epoch or seconds remaining.
		resetAt = resetRaw > 1_000_000_000 ? new Date(resetRaw * 1000) : new Date(Date.now() + resetRaw * 1000);
	}
	return { limit, remaining, resetAt };
}

export function readInt(headers: Headers, name: string): number | null {
	const raw = headers.get(name);
	if (raw === null) return null;
	const value = Number.parseInt(raw, 10);
	return Number.isFinite(value) ? value : null;
}
