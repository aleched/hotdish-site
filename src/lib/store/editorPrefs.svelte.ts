import { browser } from '$app/environment';

const STORAGE_KEY = 'hotdish.editor.v1';

export type EditorMode = 'form' | 'rich' | 'source' | 'raw';

export const EDITOR_MODES: readonly {
	value: EditorMode;
	label: string;
	icon: 'form' | 'markdown' | 'rich' | 'file';
}[] = [
	{ value: 'form', label: 'Form', icon: 'form' },
	{ value: 'rich', label: 'Rich text', icon: 'rich' },
	{ value: 'source', label: 'Markdown', icon: 'markdown' },
	{ value: 'raw', label: 'Raw file', icon: 'file' }
];

class EditorPrefs {
	defaultMode = $state<EditorMode>('form');
	spellcheck = $state(true);
	fractions = $state(true);
	randomButton = $state(true);

	constructor() {
		if (!browser) return;
		try {
			const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
				fractions?: boolean;
				defaultMode?: string;
				spellcheck?: boolean;
				randomButton?: boolean;
			};
			if (typeof parsed.fractions === 'boolean') this.fractions = parsed.fractions;
			if (typeof parsed.spellcheck === 'boolean') this.spellcheck = parsed.spellcheck;
			if (typeof parsed.randomButton === 'boolean') this.randomButton = parsed.randomButton;
			const mode = EDITOR_MODES.find((item) => item.value === parsed.defaultMode);
			if (mode) this.defaultMode = mode.value;
		} catch {
			// Ignore unreadable preferences.
		}
	}

	setFractions(enabled: boolean): void {
		this.fractions = enabled;
		this.persist();
	}

	setDefaultMode(mode: EditorMode): void {
		this.defaultMode = mode;
		this.persist();
	}

	setSpellcheck(enabled: boolean): void {
		this.spellcheck = enabled;
		this.persist();
	}

	setRandomButton(enabled: boolean): void {
		this.randomButton = enabled;
		this.persist();
	}

	private persist(): void {
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					fractions: this.fractions,
					defaultMode: this.defaultMode,
					spellcheck: this.spellcheck,
					randomButton: this.randomButton
				})
			);
		} catch {
			// Storage can be blocked; the choice just won't persist.
		}
	}
}

export const editorPrefs = new EditorPrefs();
