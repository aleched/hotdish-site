<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		icon: 'repos' | 'folder' | 'clock' | 'empty';
		label: string;
	}

	let { icon, label }: Props = $props();
</script>

<p class="muted empty" title={label}>
	<Icon name={icon} size={28} /><span class="visually-hidden">{label}</span>
</p>

<style>
	.empty {
		display: flex;
		align-items: center;
		margin: 0.5rem 0;
		opacity: 0.5;
	}
</style>
