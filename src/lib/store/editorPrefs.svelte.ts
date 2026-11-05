import { browser } from '$app/environment';

const STORAGE_KEY = 'hotdish.editor.v1';

class EditorPrefs {
	fractions = $state(true);

	constructor() {
		if (!browser) return;
		try {
			const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
				fractions?: boolean;
			};
			if (typeof parsed.fractions === 'boolean') this.fractions = parsed.fractions;
		} catch {
			// Ignore unreadable preferences.
		}
	}

	setFractions(enabled: boolean): void {
		this.fractions = enabled;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ fractions: this.fractions }));
		} catch {
			// Storage can be blocked; the choice just won't persist.
		}
	}
}

export const editorPrefs = new EditorPrefs();
