<script lang="ts">
	import Icon from './Icon.svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		label?: string;
	}

	let { label = m.loading_default() }: Props = $props();
</script>

<p class="muted loading" role="status" title={label}>
	<Icon name="spinner" size={20} /><span class="visually-hidden">{label}</span>
</p>

<style>
	.loading {
		display: flex;
		align-items: center;
		margin: 0.5rem 0;
	}
</style>
