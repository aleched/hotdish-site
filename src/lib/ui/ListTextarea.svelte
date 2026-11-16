<script lang="ts">
	import { itemsToLines, linesToItems } from '#lib/template/serialize.ts';
	import LineNumberedTextarea from './LineNumberedTextarea.svelte';

	interface Props {
		items: string[];
		gutter: 'bullet' | 'number';
		placeholder: string;
	}

	let { items = $bindable(), gutter, placeholder }: Props = $props();

	// Keep the editing buffer separate from the normalized list to preserve whitespace and selection.
	// svelte-ignore state_referenced_locally
	let normalized = itemsToLines(items);
	let value = $state(normalized);

	$effect(() => {
		const next = itemsToLines(items);
		if (next !== normalized) {
			normalized = next;
			value = next;
		}
	});

	function oninput(event: Event & { currentTarget: HTMLTextAreaElement }) {
		value = event.currentTarget.value;
		const next = linesToItems(value);
		normalized = itemsToLines(next);
		items = next;
	}
</script>

<LineNumberedTextarea
	rows={3}
	fit
	{gutter}
	{placeholder}
	{value}
	{oninput}
/>
