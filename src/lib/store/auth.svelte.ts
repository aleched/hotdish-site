import type { RepoRef } from '$lib/forge/types';
import { profileStore } from './profiles.svelte';
import { repoStore } from './repo.svelte';

/**
 * Coordinates the "add an access token" prompt. Write actions call `requireToken()` and only
 * continue when it resolves true, so the prompt can sit in front of any of them.
 */
class AuthStore {
	prompting = $state(false);
	#pending: Promise<boolean> | null = null;
	#resolve: ((ok: boolean) => void) | null = null;

	/** `force` re-prompts even when a token exists, e.g. after it was rejected. */
	requireToken(options: { force?: boolean } = {}): Promise<boolean> {
		if (!repoStore.ref) return Promise.resolve(false);
		if (!options.force && repoStore.provider?.authenticated) return Promise.resolve(true);
		if (this.#pending) return this.#pending;

		this.prompting = true;
		this.#pending = new Promise<boolean>((resolve) => {
			this.#resolve = resolve;
		});
		return this.#pending;
	}

	/** Persists the token for the current repository and resumes the waiting action. */
	accept(ref: RepoRef, token: string): void {
		repoStore.setToken(token);
		profileStore.saveTokenFor(ref, token);
		this.#finish(true);
	}

	cancel(): void {
		this.#finish(false);
	}

	#finish(ok: boolean): void {
		const resolve = this.#resolve;
		this.prompting = false;
		this.#pending = null;
		this.#resolve = null;
		resolve?.(ok);
	}
}

export const authStore = new AuthStore();
