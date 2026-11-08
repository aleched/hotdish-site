import { getLocale, locales, setLocale, type Locale } from '#lib/paraglide/runtime.js';

interface LocaleInfo {
	english: string;
	native: string;
}

// Flags are only a visual shortcut; the native name is always the accessible label.
const INFO: Record<Locale, LocaleInfo> = {
	en: { english: 'English', native: 'English' },
	af: { english: 'Afrikaans', native: 'Afrikaans' },
	ar: { english: 'Arabic', native: 'العربية' },
	bg: { english: 'Bulgarian', native: 'Български' },
	ca: { english: 'Catalan', native: 'Català' },
	cs: { english: 'Czech', native: 'Čeština' },
	da: { english: 'Danish', native: 'Dansk' },
	de: { english: 'German', native: 'Deutsch' },
	el: { english: 'Greek', native: 'Ελληνικά' },
	es: { english: 'Spanish', native: 'Español' },
	fa: { english: 'Persian', native: 'فارسی' },
	fi: { english: 'Finnish', native: 'Suomi' },
	fil: { english: 'Filipino', native: 'Filipino' },
	fr: { english: 'French', native: 'Français' },
	he: { english: 'Hebrew', native: 'עברית' },
	hi: { english: 'Hindi', native: 'हिन्दी' },
	hr: { english: 'Croatian', native: 'Hrvatski' },
	hu: { english: 'Hungarian', native: 'Magyar' },
	id: { english: 'Indonesian', native: 'Bahasa Indonesia' },
	it: { english: 'Italian', native: 'Italiano' },
	ja: { english: 'Japanese', native: '日本語' },
	ko: { english: 'Korean', native: '한국어' },
	ms: { english: 'Malay', native: 'Bahasa Melayu' },
	nb: { english: 'Norwegian', native: 'Norsk' },
	nl: { english: 'Dutch', native: 'Nederlands' },
	pl: { english: 'Polish', native: 'Polski' },
	pt: { english: 'Portuguese', native: 'Português' },
	ro: { english: 'Romanian', native: 'Română' },
	ru: { english: 'Russian', native: 'Русский' },
	so: { english: 'Somali', native: 'Soomaali' },
	sr: { english: 'Serbian', native: 'Srpski' },
	sv: { english: 'Swedish', native: 'Svenska' },
	th: { english: 'Thai', native: 'ไทย' },
	tlh: { english: 'Klingon', native: 'tlhIngan Hol' },
	tr: { english: 'Turkish', native: 'Türkçe' },
	uk: { english: 'Ukrainian', native: 'Українська' },
	ur: { english: 'Urdu', native: 'اردو' },
	vi: { english: 'Vietnamese', native: 'Tiếng Việt' },
	zh: { english: 'Chinese', native: '中文' }
};

const RTL: readonly Locale[] = ['ar', 'fa', 'he', 'ur'];

export function localeDirection(locale: Locale): 'ltr' | 'rtl' {
	return RTL.includes(locale) ? 'rtl' : 'ltr';
}

export function nativeName(locale: Locale): string {
	return INFO[locale].native;
}

// The selected language comes first, then the rest by language code. Filtered by code or name.
export function languageOptions(selected: Locale, query = ''): Locale[] {
	const q = query.trim().toLowerCase();
	const matches = (locale: Locale) =>
		!q ||
		locale.includes(q) ||
		INFO[locale].native.toLowerCase().includes(q) ||
		INFO[locale].english.toLowerCase().includes(q);
	const rest = [...locales].filter((l) => l !== selected).sort((a, b) => a.localeCompare(b));
	return [selected, ...rest].filter(matches);
}

export { getLocale, setLocale };
export type { Locale };
