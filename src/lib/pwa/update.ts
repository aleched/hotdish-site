import { browser } from '$app/environment';

/**
 * A new service worker waits until every tab closes, which an installed phone app rarely
 * does. Instead the update is applied on the next navigation while no editor is open, so it
 * never interrupts typing.
 */
let openEditors = 0;
let registration: ServiceWorkerRegistration | null = null;
let ready = false;

export function editorOpened(): () => void {
	openEditors++;
	let closed = false;
	return () => {
		if (closed) return;
		closed = true;
		openEditors = Math.max(0, openEditors - 1);
	};
}

export function initUpdates(): void {
	if (!browser || !('serviceWorker' in navigator)) return;
	void navigator.serviceWorker.ready.then((reg) => {
		registration = reg;
		const check = () => {
			// With no controller this is the first install, not an update.
			if (reg.waiting && navigator.serviceWorker.controller) ready = true;
		};
		check();
		reg.addEventListener('updatefound', () => {
			const worker = reg.installing;
			worker?.addEventListener('statechange', () => {
				if (worker.state === 'installed') check();
			});
		});
		// Phones keep installed apps suspended for days; look for a new version on resume.
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') reg.update().catch(() => {});
		});
	});
}

/** True when an update is waiting and it is safe to apply it now. */
export function shouldApplyUpdate(): boolean {
	return ready && openEditors === 0 && Boolean(registration?.waiting);
}

/** Activates the waiting version and loads `href` with it. */
export function applyUpdate(href: string): void {
	const waiting = registration?.waiting;
	ready = false;
	if (!waiting) {
		location.href = href;
		return;
	}
	let done = false;
	const go = () => {
		if (done) return;
		done = true;
		location.href = href;
	};
	navigator.serviceWorker.addEventListener('controllerchange', go, { once: true });
	waiting.postMessage({ type: 'skip-waiting' });
	// Navigate anyway if the switch takes too long; the next launch will pick up the update.
	setTimeout(go, 3000);
}
