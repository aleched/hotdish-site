<script lang="ts">
	import type { Locale } from '$lib/paraglide/runtime';
	import {
		AD, BD, BG, CN, CZ, DE, DK, ES, FI, FR, GR, HR, HU, ID, IL, IN, IR, IS, IT, JP, KR, MY, NL,
		NO, PH, PK, PL, PT, RO, RS, RU, SA, SE, SO, TH, TR, TZ, UA, US, VN, ZA
	} from 'country-flag-icons/string/3x2';

	let { locale, width = 22 }: { locale: Locale; width?: number } = $props();

	// Klingon has no country; a simple dark field with a red emblem stands in.
	const KLINGON =
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2"><rect width="3" height="2" fill="#111"/><g fill="#c8102e"><polygon points="1.5,0.3 1.75,1.0 1.5,0.85 1.25,1.0"/><polygon points="0.9,1.6 1.4,1.0 1.45,1.2 1.2,1.7"/><polygon points="2.1,1.6 1.6,1.0 1.55,1.2 1.8,1.7"/></g></svg>';
	// A language has no flag of its own; each locale borrows one country's flag by convention.
	const FLAGS: Record<Locale, string> = {
		en: US,
		af: ZA,
		ar: SA,
		bg: BG,
		bn: BD,
		ca: AD,
		cs: CZ,
		da: DK,
		de: DE,
		el: GR,
		es: ES,
		fa: IR,
		fi: FI,
		fr: FR,
		he: IL,
		hi: IN,
		hr: HR,
		hu: HU,
		id: ID,
		is: IS,
		it: IT,
		ja: JP,
		ko: KR,
		ms: MY,
		nb: NO,
		nl: NL,
		pl: PL,
		pt: PT,
		ro: RO,
		ru: RU,
		so: SO,
		sr: RS,
		sv: SE,
		sw: TZ,
		ta: IN,
		th: TH,
		tl: PH,
		tlh: KLINGON,
		tr: TR,
		uk: UA,
		ur: PK,
		vi: VN,
		zh: CN
	};
</script>

<span class="flag" style:width="{width}px" style:height="{(width * 2) / 3}px" aria-hidden="true">
	{@html FLAGS[locale]}
</span>

<style>
	.flag {
		display: block;
		overflow: hidden;
		border-radius: 2px;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
	}

	.flag :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
