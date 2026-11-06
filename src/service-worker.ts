/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const APP_CACHE = `hotdish-${version}`;
const IMAGE_CACHE = 'hotdish-images';
const IMAGE_LIMIT = 40;
const SHELL = '/';

const ASSETS = [...build, ...files];
const ASSET_SET = new Set(ASSETS);

sw.addEventListener('install', (event) => {
	// No skipWaiting here: the page decides when it is safe to switch (src/lib/pwa/update.ts).
	event.waitUntil(
		(async () => {
			const cache = await caches.open(APP_CACHE);
			await cache.addAll([...ASSETS, SHELL]);
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== APP_CACHE && key !== IMAGE_CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('message', (event) => {
	if (event.data?.type === 'skip-waiting') void sw.skipWaiting();
});

function cacheable(response: Response): boolean {
	return response.ok && !response.redirected && response.type === 'basic';
}

/** Network first so a deploy shows up at once; the cached shell keeps the app opening offline. */
async function navigate(request: Request): Promise<Response> {
	const cache = await caches.open(APP_CACHE);
	try {
		const response = await fetch(request);
		if (cacheable(response)) await cache.put(request, response.clone());
		return response;
	} catch {
		return (
			(await cache.match(request, { ignoreSearch: true })) ??
			(await cache.match(SHELL)) ??
			Response.error()
		);
	}
}

/** Build output is content-hashed, so a cached copy is always right. */
async function asset(request: Request): Promise<Response> {
	const cache = await caches.open(APP_CACHE);
	const cached = await cache.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	if (cacheable(response)) await cache.put(request, response.clone());
	return response;
}

async function trimImages(cache: Cache): Promise<void> {
	const keys = await cache.keys();
	for (const key of keys.slice(0, Math.max(0, keys.length - IMAGE_LIMIT))) await cache.delete(key);
}

/** Pictures in documents: show the saved copy at once and refresh it in the background. */
async function image(event: FetchEvent): Promise<Response> {
	const cache = await caches.open(IMAGE_CACHE);
	const cached = await cache.match(event.request);
	const network = fetch(event.request)
		.then(async (response) => {
			if (response.ok || response.type === 'opaque') {
				await cache.delete(event.request);
				await cache.put(event.request, response.clone());
				await trimImages(cache);
			}
			return response;
		})
		.catch(() => undefined);
	if (cached) {
		event.waitUntil(network);
		return cached;
	}
	return (await network) ?? Response.error();
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	const sameOrigin = url.origin === sw.location.origin;

	if (request.mode === 'navigate' && sameOrigin) {
		event.respondWith(navigate(request));
	} else if (sameOrigin && ASSET_SET.has(url.pathname)) {
		event.respondWith(asset(request));
	} else if (!sameOrigin && request.destination === 'image') {
		event.respondWith(image(event));
	}
	// Everything else, including forge API calls, goes straight to the network; the app keeps
	// its own copy of repository data in IndexedDB.
});
