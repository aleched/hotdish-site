<script lang="ts">
	interface Props {
		name: 'plus' | 'edit' | 'trash' | 'move' | 'expand' | 'collapse' | 'settings' | 'grip';
		size?: number;
	}

	let { name, size = 16 }: Props = $props();
</script>

<svg
	viewBox="0 0 16 16"
	width={size}
	height={size}
	fill="none"
	stroke="currentColor"
	stroke-width="1.4"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'plus'}
		<path d="M8 3v10M3 8h10" />
	{:else if name === 'edit'}
		<path d="M11.2 2.3a1.5 1.5 0 0 1 2.1 0l.4.4a1.5 1.5 0 0 1 0 2.1L5.4 13.1 2 14l.9-3.4z" />
		<path d="M10 3.5l2.5 2.5" />
	{:else if name === 'trash'}
		<path d="M2.5 4h11" />
		<path d="M6 4V2.5h4V4" />
		<path d="M3.8 4l.7 9.5h7l.7-9.5" />
		<path d="M6.5 6.5v4.5M9.5 6.5v4.5" />
	{:else if name === 'move'}
		<path d="M1.5 3h4l1.5 1.5h7.5v8.5h-13z" />
		<path d="M5.5 9h5M8.5 7l2 2-2 2" />
	{:else if name === 'expand'}
		<path d="M2.5 8h11" />
		<path d="M5 5l3-2.5L11 5M5 11l3 2.5 3-2.5" />
	{:else if name === 'collapse'}
		<path d="M2.5 8h11" />
		<path d="M5 2.5L8 5l3-2.5M5 13.5L8 11l3 2.5" />
	{:else if name === 'settings'}
		<circle cx="8" cy="8" r="2.2" />
		<path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
		<circle cx="8" cy="8" r="4.6" />
	{:else if name === 'grip'}
		<g fill="currentColor" stroke="none">
			<circle cx="6" cy="3.5" r="1.1" /><circle cx="10" cy="3.5" r="1.1" />
			<circle cx="6" cy="8" r="1.1" /><circle cx="10" cy="8" r="1.1" />
			<circle cx="6" cy="12.5" r="1.1" /><circle cx="10" cy="12.5" r="1.1" />
		</g>
	{/if}
</svg>
