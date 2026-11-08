import { browser } from '$app/env';

const WELCOME_KEY = 'hotdish.welcome.v1';

function read(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

class FirstRunStore {
	welcomeDismissed = $state(browser ? read(WELCOME_KEY) === '1' : true);

	dismissWelcome(): void {
		this.welcomeDismissed = true;
		try {
			localStorage.setItem(WELCOME_KEY, '1');
		} catch {
			// Storage unavailable: the welcome simply shows again next time.
		}
	}
}

export const firstRunStore = new FirstRunStore();
