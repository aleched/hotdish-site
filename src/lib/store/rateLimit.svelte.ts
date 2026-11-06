import type { ForgeKind } from '#lib/forge/types.ts';

export interface RateLimitNotice {
	kind: ForgeKind;
	host: string;
	resetAt: Date | null;
}

/** Holds the most recent rate limit rejection so the layout can show a single popup. */
class RateLimitStore {
	notice = $state<RateLimitNotice | null>(null);

	report(notice: RateLimitNotice): void {
		// Parallel requests often fail together; keep the first popup rather than replacing it.
		if (!this.notice) this.notice = notice;
	}

	dismiss(): void {
		this.notice = null;
	}
}

export const rateLimitStore = new RateLimitStore();
