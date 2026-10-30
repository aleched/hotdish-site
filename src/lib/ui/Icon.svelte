<script lang="ts">
	interface Props {
		name: 'plus' | 'edit' | 'trash' | 'move';
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
	{/if}
</svg>
