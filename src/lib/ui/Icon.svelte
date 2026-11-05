<script lang="ts">
	interface Props {
		name:
			| 'plus'
			| 'edit'
			| 'trash'
			| 'move'
			| 'expand'
			| 'collapse'
			| 'settings'
			| 'grip'
			| 'filter'
			| 'text'
			| 'list'
			| 'ordered'
			| 'form'
			| 'markdown'
			| 'rich'
			| 'save'
			| 'cancel'
			| 'undo'
			| 'search'
			| 'folder'
			| 'tag'
			| 'section'
			| 'subsection'
			| 'clock'
			| 'repos'
			| 'link'
			| 'branch'
			| 'key'
			| 'keyoff'
			| 'servings'
			| 'prep'
			| 'cook'
			| 'file'
			| 'sun'
			| 'moon'
			| 'monitor'
			| 'palette'
			| 'info'
			| 'cache'
			| 'refresh'
			| 'spinner'
			| 'home'
			| 'up'
			| 'check'
			| 'message'
			| 'confirm';
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
	class:spin={name === 'spinner'}
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
		<path stroke-width="1.8" d="M4 2.5L8 6l4-3.5M4 9.5L8 13l4-3.5" />
	{:else if name === 'collapse'}
		<path stroke-width="1.8" d="M2.5 4L6 8l-3.5 4M9 4l3.5 4L9 12" />
	{:else if name === 'settings'}
		<path stroke-width="1.2" d="M6.69 2.76L6.90 1.09L9.10 1.09L9.31 2.76A5.4 5.4 0 0 1 10.78 3.37L12.11 2.34L13.66 3.89L12.63 5.22A5.4 5.4 0 0 1 13.24 6.69L14.91 6.90L14.91 9.10L13.24 9.31A5.4 5.4 0 0 1 12.63 10.78L13.66 12.11L12.11 13.66L10.78 12.63A5.4 5.4 0 0 1 9.31 13.24L9.10 14.91L6.90 14.91L6.69 13.24A5.4 5.4 0 0 1 5.22 12.63L3.89 13.66L2.34 12.11L3.37 10.78A5.4 5.4 0 0 1 2.76 9.31L1.09 9.10L1.09 6.90L2.76 6.69A5.4 5.4 0 0 1 3.37 5.22L2.34 3.89L3.89 2.34L5.22 3.37A5.4 5.4 0 0 1 6.69 2.76z" />
		<circle cx="8" cy="8" r="2.2" stroke-width="1.2" />
	{:else if name === 'text'}
		<path d="M2.5 4h11M2.5 8h11M2.5 12h7" />
	{:else if name === 'list'}
		<g fill="currentColor" stroke="none">
			<circle cx="3" cy="4" r="1" /><circle cx="3" cy="8" r="1" /><circle cx="3" cy="12" r="1" />
		</g>
		<path d="M6.5 4h7M6.5 8h7M6.5 12h7" />
	{:else if name === 'ordered'}
		<path d="M1.8 3.4l1.1-.7v3.3M1.8 9.4c.2-.9 2.2-.9 2.2.1 0 .9-2.2 1.5-2.2 2.5h2.3" stroke-width="1.1" />
		<path d="M6.5 4h7M6.5 8h7M6.5 12h7" />
	{:else if name === 'form'}
		<rect x="2" y="2" width="12" height="12" rx="1.5" />
		<path d="M5 6h6M5 10h4" />
	{:else if name === 'markdown'}
		<rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
		<path d="M4 10V6l2 2.5L8 6v4M11 6v4M9.5 8.5l1.5 1.5 1.5-1.5" stroke-width="1.2" />
	{:else if name === 'file'}
		<path d="M3.5 1.8h6l3 3v9.4h-9z" />
		<path d="M9.5 1.8v3h3M6 8.5h4M6 11h4" />
	{:else if name === 'rich'}
		<path d="M1.5 12.5l3.2-9 3.2 9M2.7 9.5h4" />
		<path d="M10 12.5V8.2M10 9.6c.3-1 1-1.4 2-1.4s1.5.6 1.5 1.5v2.8" stroke-width="1.2" />
	{:else if name === 'save'}
		<path d="M2.5 3.5a1 1 0 0 1 1-1h7.6l2.4 2.4v7.6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" />
		<path d="M5 2.5v3.3h5V2.5M4.8 13.5V9.2h6.4v4.3" />
	{:else if name === 'cancel'}
		<circle cx="8" cy="8" r="6" />
		<path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" />
	{:else if name === 'undo'}
		<path d="M5.5 3L2.5 6l3 3" />
		<path d="M2.5 6H9a4 4 0 0 1 0 8H6" />
	{:else if name === 'search'}
		<circle cx="7" cy="7" r="4.5" />
		<path d="M10.4 10.4L14 14" />
	{:else if name === 'folder'}
		<path d="M1.5 3.5h4.2l1.5 1.5h7.3v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
	{:else if name === 'tag'}
		<path d="M2 2.5h5.6l6.4 6.4-5.1 5.1L2.5 7.6z" />
		<circle cx="5.2" cy="5.2" r="1" />
	{:else if name === 'section'}
		<rect x="2" y="2.5" width="12" height="4" rx="1" />
		<rect x="2" y="9.5" width="12" height="4" rx="1" />
	{:else if name === 'subsection'}
		<rect x="2" y="2.5" width="12" height="3.5" rx="1" />
		<rect x="5" y="9.5" width="9" height="4" rx="1" />
		<path d="M3.5 7v4.5H5" />
	{:else if name === 'clock'}
		<circle cx="8" cy="8" r="6" />
		<path d="M8 4.5V8l2.3 1.5" />
	{:else if name === 'repos'}
		<path d="M3 2.5h8.5a1.5 1.5 0 0 1 1.5 1.5v8.5H4.5A1.5 1.5 0 0 1 3 11z" />
		<path d="M3 11a1.5 1.5 0 0 1 1.5-1.5H13M6 5.5h4" />
	{:else if name === 'link'}
		<path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.5-2.5a2.6 2.6 0 0 0-3.7-3.7l-.8.8" />
		<path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3 9.3A2.6 2.6 0 0 0 6.7 13l.8-.8" />
	{:else if name === 'branch'}
		<circle cx="4.5" cy="3.5" r="1.5" />
		<circle cx="4.5" cy="12.5" r="1.5" />
		<circle cx="11.5" cy="5.5" r="1.5" />
		<path d="M4.5 5v6M11.5 7c0 2.5-3 2.5-7 4" />
	{:else if name === 'servings'}
		<circle cx="8" cy="5.2" r="2.4" />
		<path d="M3 13.5c.4-2.7 2.3-4.2 5-4.2s4.6 1.5 5 4.2z" />
	{:else if name === 'prep'}
		<path d="M2 7.6h12c0 3.6-2.4 6.8-6 6.8s-6-3.2-6-6.8z" />
		<path d="M6 15h4" />
		<ellipse cx="6.2" cy="10.6" rx="1.4" ry="2.1" transform="rotate(45 6.2 10.6)" />
		<path d="M7.4 9.4L13.2 3.6" />
	{:else if name === 'cook'}
		<path
			transform="translate(8 7.2) scale(1.2) translate(-8 -7.2)"
			stroke-width="1.17"
			d="M8 1.8c.4 2.2 3.8 3.6 3.8 7a3.8 3.8 0 0 1-7.6 0c0-1.6.8-2.6 1.6-3.4.2 1 .6 1.6 1.2 1.9C7 5.6 7.4 3.6 8 1.8z"
		/>
	{:else if name === 'key'}
		<circle cx="5" cy="8" r="2.8" />
		<path d="M7.8 8H14M11.5 8v2.5M13.5 8v1.5" />
	{:else if name === 'keyoff'}
		<circle cx="5" cy="11" r="2.5" />
		<path d="M6.8 9.2L13 3M11 5l1.5 1.5M9.5 6.5L11 8" />
		<path d="M2 2l12 12" />
	{:else if name === 'sun'}
		<circle cx="8" cy="8" r="2.8" />
		<path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
	{:else if name === 'moon'}
		<path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1z" />
	{:else if name === 'monitor'}
		<rect x="1.8" y="2.5" width="12.4" height="8.4" rx="1.3" />
		<path d="M5.5 13.5h5M8 10.9v2.6" />
	{:else if name === 'palette'}
		<path d="M8 1.8a6.2 6.2 0 1 0 0 12.4c1.1 0 1.5-.8 1.1-1.6-.5-1 .1-1.9 1.2-1.9h1.4a2.5 2.5 0 0 0 2.5-2.5C14.2 4.6 11.5 1.8 8 1.8z" />
		<circle cx="5" cy="7.4" r=".7" />
		<circle cx="7.6" cy="4.8" r=".7" />
		<circle cx="10.8" cy="5.8" r=".7" />
	{:else if name === 'info'}
		<circle cx="8" cy="8" r="6" />
		<path d="M8 7.2V11M8 5v.1" />
	{:else if name === 'cache'}
		<ellipse cx="8" cy="4" rx="5" ry="2" />
		<path d="M3 4v4c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8v4c0 1.1 2.2 2 5 2s5-.9 5-2V8" />
	{:else if name === 'refresh'}
		<path d="M13.5 3v3.5H10" />
		<path d="M13.2 6.5A5.5 5.5 0 1 0 13.5 9" />
	{:else if name === 'spinner'}
		<path d="M8 2a6 6 0 1 0 6 6" />
	{:else if name === 'home'}
		<path d="M2 7.8L8 2.5l6 5.3" />
		<path d="M3.8 6.8V13.5h8.4V6.8M6.5 13.5V9.5h3v4" />
	{:else if name === 'up'}
		<path d="M3 2.5h10M8 14V5.5M4.8 8.5L8 5.3l3.2 3.2" />
	{:else if name === 'check'}
		<path d="M3 8.5l3.2 3.2L13 4.8" />
	{:else if name === 'message'}
		<path d="M2.5 3h11a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H8L5 14v-2.5H2.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
	{:else if name === 'confirm'}
		<path d="M8 2L14.5 13.5h-13z" />
		<path d="M6.9 7.3a1.2 1.2 0 1 1 1.6 1.1c-.4.2-.5.5-.5.9" />
		<path d="M8 11.4v.1" />
	{:else if name === 'filter'}
		<path d="M2 3.5h12L9.5 9v4l-3 1.5V9z" />
	{:else if name === 'grip'}
		<g fill="currentColor" stroke="none">
			<circle cx="6" cy="3.5" r="1.1" /><circle cx="10" cy="3.5" r="1.1" />
			<circle cx="6" cy="8" r="1.1" /><circle cx="10" cy="8" r="1.1" />
			<circle cx="6" cy="12.5" r="1.1" /><circle cx="10" cy="12.5" r="1.1" />
		</g>
	{/if}
</svg>

<style>
	.spin {
		animation: icon-spin 0.8s linear infinite;
	}
	@keyframes icon-spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spin {
			animation-duration: 2.4s;
		}
	}
</style>
