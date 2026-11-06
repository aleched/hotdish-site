import { browser } from '$app/environment';
import { m } from '$lib/paraglide/messages.js';

const STORAGE_KEY = 'hotdish.editor.v1';

export type EditorMode = 'form' | 'rich' | 'source' | 'raw';

export const EDITOR_MODES: readonly {
	value: EditorMode;
	label: string;
	icon: 'form' | 'markdown' | 'rich' | 'file';
}[] = [
	{ value: 'form', label: m.mode_form(), icon: 'form' },
	{ value: 'rich', label: m.mode_rich(), icon: 'rich' },
	{ value: 'source', label: m.mode_markdown(), icon: 'markdown' },
	{ value: 'raw', label: m.mode_raw(), icon: 'file' }
];

export type DefaultTemplateChoice = 'recipe' | 'note' | 'none';

export const DEFAULT_TEMPLATES: readonly {
	value: DefaultTemplateChoice;
	label: string;
	icon: 'fork-knife' | 'text' | 'empty';
}[] = [
	{ value: 'recipe', label: m.template_recipe(), icon: 'fork-knife' },
	{ value: 'note', label: m.template_note(), icon: 'text' },
	{ value: 'none', label: m.template_none(), icon: 'empty' }
];

export const MAX_RECENT_DAYS = 365;

/** null means no limit; 0 hides the recent section. */
export type RecentDays = number | null;

function clampDays(days: number): RecentDays {
	if (!Number.isFinite(days)) return null;
	return Math.min(MAX_RECENT_DAYS, Math.max(0, Math.round(days)));
}

class EditorPrefs {
	defaultMode = $state<EditorMode>('form');
	spellcheck = $state(true);
	fractions = $state(true);
	randomButton = $state(true);
	strikeLists = $state(true);
	recentDays = $state<RecentDays>(7);
	defaultTemplate = $state<DefaultTemplateChoice>('recipe');

	constructor() {
		if (!browser) return;
		try {
			const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
				fractions?: boolean;
				defaultMode?: string;
				spellcheck?: boolean;
				randomButton?: boolean;
				strikeLists?: boolean;
				recentDays?: number | null;
				defaultTemplate?: string;
			};
			if (typeof parsed.fractions === 'boolean') this.fractions = parsed.fractions;
			if (typeof parsed.spellcheck === 'boolean') this.spellcheck = parsed.spellcheck;
			if (typeof parsed.randomButton === 'boolean') this.randomButton = parsed.randomButton;
			if (typeof parsed.strikeLists === 'boolean') this.strikeLists = parsed.strikeLists;
			if (parsed.recentDays === null) this.recentDays = null;
			else if (typeof parsed.recentDays === 'number') this.recentDays = clampDays(parsed.recentDays);
			const mode = EDITOR_MODES.find((item) => item.value === parsed.defaultMode);
			if (mode) this.defaultMode = mode.value;
			const template = DEFAULT_TEMPLATES.find((item) => item.value === parsed.defaultTemplate);
			if (template) this.defaultTemplate = template.value;
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

	setDefaultTemplate(choice: DefaultTemplateChoice): void {
		this.defaultTemplate = choice;
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

	setStrikeLists(enabled: boolean): void {
		this.strikeLists = enabled;
		this.persist();
	}

	/** An empty or non-numeric value (NaN) clears the limit. */
	setRecentDays(days: number): void {
		this.recentDays = clampDays(days);
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
					randomButton: this.randomButton,
					strikeLists: this.strikeLists,
					recentDays: this.recentDays,
					defaultTemplate: this.defaultTemplate
				})
			);
		} catch {
			// Storage can be blocked; the choice just won't persist.
		}
	}
}

export const editorPrefs = new EditorPrefs();
