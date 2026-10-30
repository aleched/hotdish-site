import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectForgeKind } from './detect';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('detectForgeKind', () => {
	it('uses known public forge hosts without probing', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);

		await expect(detectForgeKind('github.com')).resolves.toBe('github');
		await expect(detectForgeKind('github.com:8443')).resolves.toBe('github');
		expect(fetch).not.toHaveBeenCalled();
	});

	it('detects GitLab from a self-hosted version response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL | Request) => {
				const url = String(input);
				if (url.endsWith('/api/v4/version')) {
					return Response.json({ version: '17.0.0', revision: 'abc123' });
				}
				return new Response(null, { status: 404 });
			})
		);

		await expect(detectForgeKind('git.example.org')).resolves.toBe('gitlab');
	});

	it('detects Gitea from its version endpoint', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL | Request) => {
				if (String(input).endsWith('/api/v1/version')) {
					return Response.json({ version: '1.22.0' });
				}
				return new Response(null, { status: 404 });
			})
		);

		await expect(detectForgeKind('git.example.org')).resolves.toBe('gitea');
	});

	it('detects GitHub Enterprise from its metadata endpoint', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL | Request) => {
				if (String(input).endsWith('/api/v3/meta')) {
					return Response.json({ installed_version: '3.14.0' });
				}
				return new Response(null, { status: 404 });
			})
		);

		await expect(detectForgeKind('git.example.org')).resolves.toBe('github');
	});

	it('returns null when the self-hosted APIs cannot be reached', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));

		await expect(detectForgeKind('git.example.org')).resolves.toBeNull();
	});
});
