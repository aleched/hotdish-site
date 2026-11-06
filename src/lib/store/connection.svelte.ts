import { browser } from '$app/env';
import { connectionState, type ConnectionState } from './connectionState';

/**
 * Whether the data on screen is live. The browser's online flag alone is not enough: a
 * captive portal or an unreachable forge also leaves the site working from its cache.
 */
class ConnectionStore {
	#pending = $state(0);
	browserOnline = $state(browser ? navigator.onLine : true);
	/** False after a refresh or request failed; true again once a refresh succeeds. */
	reachable = $state(true);
	lastSyncedAt = $state<number | null>(null);
	lastError = $state<string | null>(null);

	constructor() {
		if (!browser) return;
		window.addEventListener('online', () => this.browserOnline = true);
		window.addEventListener('offline', () => this.browserOnline = false);
	}

	get state(): ConnectionState {
		return connectionState(this.#pending, this.browserOnline, this.reachable);
	}

	/** True when writes can reach the forge. Stays true during a refresh that started while live. */
	get online(): boolean {
		return this.browserOnline && this.reachable;
	}

	begin(): void {
		this.#pending++;
	}

	end(): void {
		this.#pending = Math.max(0, this.#pending - 1);
	}

	markLive(): void {
		this.reachable = true;
		this.lastError = null;
		this.lastSyncedAt = Date.now();
	}

	markOffline(error?: string): void {
		this.reachable = false;
		if (error) this.lastError = error;
	}

	/** Seeds the "last synced" time from a cached snapshot when nothing fresher is known. */
	noteSnapshot(savedAt: number): void {
		if (this.lastSyncedAt === null || savedAt > this.lastSyncedAt) this.lastSyncedAt = savedAt;
	}
}

export const connectionStore = new ConnectionStore();
