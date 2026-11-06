import { afterEach, describe, expect, it, vi } from 'vitest';
import { readInt, readRateLimit } from './rateLimitHeaders';

describe('readInt', () => {
	it('parses integers and rejects missing or non-numeric values', () => {
		const headers = new Headers({ a: '42', b: 'abc' });
		expect(readInt(headers, 'a')).toBe(42);
		expect(readInt(headers, 'b')).toBeNull();
		expect(readInt(headers, 'missing')).toBeNull();
	});
});

describe('readRateLimit', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns null when no rate limit headers are present', () => {
		expect(readRateLimit(new Headers())).toBeNull();
	});

	it('reads GitHub-style headers with an epoch reset', () => {
		const info = readRateLimit(
			new Headers({
				'x-ratelimit-limit': '60',
				'x-ratelimit-remaining': '12',
				'x-ratelimit-reset': '1700000000'
			})
		);
		expect(info).toEqual({ limit: 60, remaining: 12, resetAt: new Date(1_700_000_000_000) });
	});

	it('falls back to standard headers and treats a small reset as seconds from now', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		const info = readRateLimit(
			new Headers({ 'ratelimit-limit': '2000', 'ratelimit-remaining': '1999', 'ratelimit-reset': '30' })
		);
		expect(info).toEqual({
			limit: 2000,
			remaining: 1999,
			resetAt: new Date('2026-01-01T00:00:30Z')
		});
	});

	it('prefers x- headers over standard ones', () => {
		const info = readRateLimit(
			new Headers({ 'x-ratelimit-remaining': '5', 'ratelimit-remaining': '9' })
		);
		expect(info).toEqual({ limit: null, remaining: 5, resetAt: null });
	});

	it('ignores non-numeric values', () => {
		expect(readRateLimit(new Headers({ 'x-ratelimit-limit': 'lots' }))).toBeNull();
		expect(
			readRateLimit(new Headers({ 'x-ratelimit-limit': '60', 'x-ratelimit-reset': 'soon' }))
		).toEqual({ limit: 60, remaining: null, resetAt: null });
	});
});
