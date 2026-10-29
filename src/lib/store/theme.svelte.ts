import { browser } from '$app/environment';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemeAccent = 'default' | 'green' | 'blue' | 'purple';

export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];
export const THEME_ACCENTS: { id: ThemeAccent; label: string; color: string }[] = [
	{ id: 'default', label: 'Paprika', color: '#b4451f' },
	{ id: 'green', label: 'Basil', color: '#2f6f3e' },
	{ id: 'blue', label: 'Blueberry', color: '#2557a7' },
	{ id: 'purple', label: 'Plum', color: '#7b3fa0' }
];

const STORAGE_KEY = 'hotdish.theme.v1';

class ThemeStore {
	mode = $state<ThemeMode>('system');
	accent = $state<ThemeAccent>('default');

	constructor() {
		if (!browser) return;
		try {
			const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
				mode?: ThemeMode;
				accent?: ThemeAccent;
			};
			if (parsed.mode && THEME_MODES.includes(parsed.mode)) this.mode = parsed.mode;
			if (parsed.accent && THEME_ACCENTS.some((item) => item.id === parsed.accent)) {
				this.accent = parsed.accent;
			}
		} catch {
			// Ignore unreadable preferences.
		}
		this.#apply();
	}

	setMode(mode: ThemeMode): void {
		this.mode = mode;
		this.#save();
	}

	setAccent(accent: ThemeAccent): void {
		this.accent = accent;
		this.#save();
	}

	#save(): void {
		this.#apply();
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: this.mode, accent: this.accent }));
		} catch {
			// Storage can be blocked; the choice just won't persist.
		}
	}

	#apply(): void {
		const root = document.documentElement;
		if (this.mode === 'system') root.removeAttribute('data-theme');
		else root.setAttribute('data-theme', this.mode);
		if (this.accent === 'default') root.removeAttribute('data-accent');
		else root.setAttribute('data-accent', this.accent);
	}
}

export const themeStore = new ThemeStore();
