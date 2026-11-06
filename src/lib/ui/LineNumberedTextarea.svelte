<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { fractionBefore } from '#lib/editor/fractions.ts';

	interface Props extends Omit<HTMLTextareaAttributes, 'value' | 'class'> {
		value?: string;
		/** Grow with the content instead of scrolling. */
		fit?: boolean;
		mono?: boolean;
		/** Gutter content per line: numbers, bullets, a thin dash, or nothing. */
		gutter?: 'number' | 'bullet' | 'dash' | 'none';
		minHeight?: string;
		/** Replace typed fractions (3/4) with symbols. */
		fractions?: boolean;
		/** Reserve at least this many digits so neighbouring boxes line up. */
		minDigits?: number;
	}

	let {
		value = $bindable(''),
		fit = false,
		mono = true,
		gutter = 'number',
		minHeight,
		fractions = true,
		minDigits = 1,
		...rest
	}: Props = $props();

	let textarea = $state<HTMLTextAreaElement>();

	/** Turns a typed fraction such as 3/4 into ¾ when space or Enter is pressed. */
	function onkeydown(event: KeyboardEvent) {
		const node = event.currentTarget as HTMLTextAreaElement;
		if (!fractions) return;
		if ((event.key !== ' ' && event.key !== 'Enter') || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
		if (node.selectionStart !== node.selectionEnd) return;
		const end = node.selectionStart;
		const found = fractionBefore(node.value.slice(0, end));
		if (!found) return;
		node.setSelectionRange(end - found.length, end);
		// execCommand keeps the native undo stack and fires the normal input event.
		if (!document.execCommand('insertText', false, found.replacement)) {
			node.setRangeText(found.replacement, end - found.length, end, 'end');
			node.dispatchEvent(new Event('input', { bubbles: true }));
		}
	}
	let mirror = $state<HTMLDivElement>();
	let heights = $state<number[]>([]);
	let lineHeight = $state(18);
	let offsetTop = $state(0);
	let scrollTop = $state(0);

	let lines = $derived(value.split('\n'));
	let digits = $derived(
		gutter === 'number' ? Math.max(minDigits, String(lines.length).length) : 1
	);

	function layout() {
		const node = textarea;
		const ghost = mirror;
		if (!node || !ghost) return;
		if (fit) {
			node.style.height = 'auto';
			// scrollHeight excludes the border, which border-box sizing needs back.
			node.style.height = `${node.scrollHeight + node.offsetHeight - node.clientHeight}px`;
		}
		const style = getComputedStyle(node);
		const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
		ghost.style.width = `${Math.max(0, node.clientWidth - padding)}px`;
		ghost.style.fontFamily = style.fontFamily;
		ghost.style.fontSize = style.fontSize;
		ghost.style.lineHeight = style.lineHeight;
		ghost.style.letterSpacing = style.letterSpacing;
		ghost.style.tabSize = style.tabSize;
		offsetTop = parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth);
		const measured = Array.from(ghost.children, (child) => child.getBoundingClientRect().height);
		heights = measured;
		// Use the real line height; the shortest measured row is wrong when every row wraps.
		const css = parseFloat(style.lineHeight);
		lineHeight = Number.isFinite(css) ? css : parseFloat(style.fontSize) * 1.2;
	}

	// Re-measure whenever the text changes (including programmatic changes such as undo).
	$effect(() => {
		void value;
		layout();
	});

	$effect(() => {
		const node = textarea;
		if (!node) return;
		let width = 0;
		const observer = new ResizeObserver(() => {
			if (node.clientWidth === width) return;
			width = node.clientWidth;
			layout();
		});
		observer.observe(node);
		return () => observer.disconnect();
	});
</script>

<div class="numbered">
	{#if gutter !== 'none'}
		<div class="gutter" style:width="{digits}ch" aria-hidden="true">
			<div style:transform="translateY({-scrollTop}px)" style:padding-top="{offsetTop}px">
				{#each lines as _, index (index)}
					<div class="num" style:height="{heights[index] ?? lineHeight}px" style:line-height="{lineHeight}px">
						{gutter === 'bullet' ? '•' : gutter === 'dash' ? '›' : index + 1}
					</div>
				{/each}
			</div>
		</div>
	{/if}
	<textarea
		{...rest}
		rows={fit ? 1 : rest.rows}
		bind:this={textarea}
		bind:value
		class:mono
		class:fit
		style:min-height={minHeight}
		{onkeydown}
		onscroll={() => (scrollTop = textarea?.scrollTop ?? 0)}
	></textarea>
	<div class="mirror" bind:this={mirror} aria-hidden="true">
		{#each lines as line, index (index)}
			<div>{line || ' '}</div>
		{/each}
	</div>
</div>

<style>
	.numbered {
		position: relative;
		display: flex;
		align-items: stretch;
		gap: 0.35rem;
		width: 100%;
	}
	.gutter {
		flex: none;
		overflow: hidden;
		font-family: var(--mono);
		font-size: 0.7rem;
		color: var(--text-dim);
		opacity: 0.6;
		text-align: right;
		user-select: none;
		pointer-events: none;
	}
	.num {
		overflow: hidden;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	textarea {
		flex: 1;
		min-width: 0;
		font-size: 0.88rem;
		resize: none;
	}
	textarea.fit {
		overflow: hidden;
	}
	textarea.mono {
		font-family: var(--mono);
	}
	.mirror {
		position: absolute;
		visibility: hidden;
		pointer-events: none;
		top: 0;
		left: 0;
		white-space: pre-wrap;
		overflow-wrap: break-word;
	}
</style>
