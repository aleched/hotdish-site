import { browser } from '$app/env';
import { m } from '#lib/paraglide/messages.js';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemeAccent = 'purple' | 'blue' | 'red' | 'green' | 'yellow' | 'orange';

export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];
export const THEME_ACCENTS: { id: ThemeAccent; label: string; emoji: string; color: string }[] = [
	{ id: 'purple', label: m.accent_grape(), emoji: '🍇', color: '#7b3fa0' },
	{ id: 'blue', label: m.accent_blueberry(), emoji: '🫐', color: '#2557a7' },
	{ id: 'green', label: m.accent_avocado(), emoji: '🥑', color: '#5b7a1f' },
	{ id: 'yellow', label: m.accent_banana(), emoji: '🍌', color: '#d4a017' },
	{ id: 'orange', label: m.accent_carrot(), emoji: '🥕', color: '#bf6a14' },
	{ id: 'red', label: m.accent_tomato(), emoji: '🍅', color: '#c62f1f' }
];

const STORAGE_KEY = 'hotdish.theme.v1';

// Matches `--bg` in app.css; the browser chrome around the page follows it.
const CHROME_COLOR = { light: '#fdfbf7', dark: '#18191b' };

class ThemeStore {
	mode = $state<ThemeMode>('system');
	accent = $state<ThemeAccent>('purple');

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
		if (this.accent === 'purple') root.removeAttribute('data-accent');
		else root.setAttribute('data-accent', this.accent);
		this.#applyChromeColor();
	}

	#applyChromeColor(): void {
		const metas = document.querySelectorAll('meta[name="theme-color"]');
		// Two tags carry the light/dark pair for "system"; a forced mode sets both to one colour.
		const light = this.mode === 'dark' ? CHROME_COLOR.dark : CHROME_COLOR.light;
		const dark = this.mode === 'light' ? CHROME_COLOR.light : CHROME_COLOR.dark;
		metas.forEach((meta) => {
			const isDarkTag = meta.getAttribute('media')?.includes('dark');
			meta.setAttribute('content', isDarkTag ? dark : light);
		});
	}
}

export const themeStore = new ThemeStore();
