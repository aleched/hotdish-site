import { browser } from '$app/environment';
import type { ForgeKind, RepoRef } from '$lib/forge/types';

export interface Profile {
	id: string;
	name: string;
	kind: ForgeKind;
	host: string;
	owner: string;
	repo: string;
	ref?: string;
	basePath?: string;
	/**
	 * Stored only in this browser and never included in share links. A token in a URL would
	 * leak through history, Referer headers, server logs and link previews.
	 */
	token?: string;
}

const STORAGE_KEY = 'hotdish.profiles.v1';
const ACTIVE_KEY = 'hotdish.activeProfile.v1';

export function profileToRef(profile: Profile): RepoRef {
	return {
		kind: profile.kind,
		host: profile.host,
		owner: profile.owner,
		repo: profile.repo,
		ref: profile.ref,
		basePath: profile.basePath
	};
}

export function refMatchesProfile(ref: RepoRef, profile: Profile): boolean {
	return (
		ref.kind === profile.kind &&
		ref.host === profile.host &&
		ref.owner.toLowerCase() === profile.owner.toLowerCase() &&
		ref.repo.toLowerCase() === profile.repo.toLowerCase()
	);
}

class ProfileStore {
	profiles = $state<Profile[]>([]);
	activeId = $state<string | null>(null);

	constructor() {
		if (browser) this.#load();
	}

	get active(): Profile | undefined {
		return this.profiles.find((profile) => profile.id === this.activeId);
	}

	/** Finds a stored token for a repository, so private repos work after a reload. */
	tokenFor(ref: RepoRef): string | undefined {
		return this.profiles.find((profile) => refMatchesProfile(ref, profile))?.token || undefined;
	}

	profileFor(ref: RepoRef): Profile | undefined {
		return this.profiles.find((profile) => refMatchesProfile(ref, profile));
	}

	save(profile: Omit<Profile, 'id'> & { id?: string }): Profile {
		const id = profile.id ?? crypto.randomUUID();
		const next: Profile = { ...profile, id };
		const index = this.profiles.findIndex((item) => item.id === id);
		if (index === -1) this.profiles.push(next);
		else this.profiles[index] = next;
		this.activeId = id;
		this.#persist();
		return next;
	}

	remove(id: string): void {
		this.profiles = this.profiles.filter((profile) => profile.id !== id);
		if (this.activeId === id) this.activeId = this.profiles[0]?.id ?? null;
		this.#persist();
	}

	setActive(id: string | null): void {
		this.activeId = id;
		this.#persist();
	}

	clearToken(id: string): void {
		const profile = this.profiles.find((item) => item.id === id);
		if (!profile) return;
		profile.token = undefined;
		this.#persist();
	}

	#load(): void {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw) as Profile[];
				if (Array.isArray(parsed)) this.profiles = parsed.filter(isProfile);
			}
			this.activeId = localStorage.getItem(ACTIVE_KEY);
		} catch {
			this.profiles = [];
			this.activeId = null;
		}
	}

	#persist(): void {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profiles));
			if (this.activeId) localStorage.setItem(ACTIVE_KEY, this.activeId);
			else localStorage.removeItem(ACTIVE_KEY);
		} catch {
			// Storage can be full or blocked; profiles simply will not persist.
		}
	}
}

function isProfile(value: unknown): value is Profile {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<Profile>;
	return (
		typeof candidate.id === 'string' &&
		typeof candidate.owner === 'string' &&
		typeof candidate.repo === 'string' &&
		typeof candidate.host === 'string'
	);
}

export const profileStore = new ProfileStore();
