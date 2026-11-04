<script lang="ts">
	import type { StructuredDoc, StructuredSection } from '$lib/template/parse';
	import { itemsToLines, linesToItems } from '$lib/template/serialize';
	import type {
		RecipeTemplate,
		SectionType,
		TemplateField,
		TemplateSection
	} from '$lib/template/schema';
	import { validateFields } from '$lib/template/schema';
	import Icon from '$lib/ui/Icon.svelte';
	import TagInput from '$lib/ui/TagInput.svelte';

	interface Props {
		doc: StructuredDoc;
		template: RecipeTemplate | null;
	}

	let { doc, template }: Props = $props();

	let issues = $derived(validateFields(template, doc.fields));

	let missingSections = $derived.by<TemplateSection[]>(() => {
		if (!template) return [];
		const present = new Set(doc.sections.map((section) => section.heading.trim().toLowerCase()));
		return template.sections.filter(
			(section) => !present.has(section.heading.trim().toLowerCase())
		);
	});

	function issueFor(key: string): string | undefined {
		return issues.find((issue) => issue.key === key)?.message;
	}

	function textValue(key: string): string {
		const value = doc.fields[key];
		if (value === undefined || value === null) return '';
		return String(value);
	}

	function listValue(key: string): string[] {
		const value = doc.fields[key];
		if (Array.isArray(value)) return value.map((item) => String(item));
		if (typeof value === 'string' && value.trim()) {
			return value
				.split(',')
				.map((item) => item.trim())
				.filter(Boolean);
		}
		return [];
	}

	function setField(key: string, value: unknown) {
		if (value === '' || value === undefined || (Array.isArray(value) && value.length === 0)) {
			delete doc.fields[key];
		} else {
			doc.fields[key] = value;
		}
	}

	function toggleListValue(key: string, option: string) {
		const current = listValue(key);
		const index = current.findIndex((item) => item.toLowerCase() === option.toLowerCase());
		const next = index === -1 ? [...current, option] : current.filter((_, i) => i !== index);
		setField(key, next);
	}

	function addSection(section: TemplateSection) {
		doc.sections.push({
			heading: section.heading,
			type: section.type,
			templateId: section.id,
			matched: true,
			blocks: [{ items: [], leadingText: '', trailingText: '' }]
		});
	}

	function removeSection(index: number) {
		doc.sections.splice(index, 1);
	}

	function addBlock(section: StructuredSection) {
		section.blocks.push({ heading: '', items: [], leadingText: '', trailingText: '' });
	}

	function removeBlock(section: StructuredSection, index: number) {
		section.blocks.splice(index, 1);
	}

	function moveSection(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= doc.sections.length) return;
		const [item] = doc.sections.splice(index, 1);
		doc.sections.splice(target, 0, item);
	}

	function templateSectionFor(section: StructuredSection): TemplateSection | undefined {
		return template?.sections.find((item) => item.id === section.templateId);
	}

	function placeholderFor(type: string): string {
		if (type === 'ordered') return 'One step per line';
		if (type === 'list') return 'One ingredient per line';
		return 'Notes, prose, anything';
	}

	function fieldInputId(field: TemplateField): string {
		return `field-${field.key}`;
	}

	const SECTION_TYPES: { value: SectionType; label: string }[] = [
		{ value: 'text', label: 'Free text' },
		{ value: 'list', label: 'Bulleted' },
		{ value: 'ordered', label: 'Numbered' }
	];

	function onTypeKey(event: KeyboardEvent, section: StructuredSection) {
		const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
		if (!step) return;
		event.preventDefault();
		const current = SECTION_TYPES.findIndex((item) => item.value === section.type);
		const next = (current + step + SECTION_TYPES.length) % SECTION_TYPES.length;
		section.type = SECTION_TYPES[next].value;
		// The first child is the sliding highlight, so the radios start at index 1.
		const group = event.currentTarget as HTMLElement;
		requestAnimationFrame(() =>
			(group.parentElement?.children[next + 1] as HTMLElement | undefined)?.focus()
		);
	}

	let dragIndex = $state<number | null>(null);
	let overIndex = $state<number | null>(null);

	function onDragStart(event: DragEvent, index: number) {
		dragIndex = index;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', String(index));
			// Drag the whole card rather than just the grip.
			const card = (event.currentTarget as HTMLElement).closest('section');
			if (card) event.dataTransfer.setDragImage(card, 16, 16);
		}
	}

	function onDragOver(event: DragEvent, index: number) {
		if (dragIndex === null) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		overIndex = index;
	}

	function onDrop(event: DragEvent, index: number) {
		event.preventDefault();
		if (dragIndex !== null && dragIndex !== index) moveSection(dragIndex, index - dragIndex);
		onDragEnd();
	}

	function onDragEnd() {
		dragIndex = null;
		overIndex = null;
	}

	function onGripKey(event: KeyboardEvent, index: number) {
		const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
		if (!delta) return;
		event.preventDefault();
		moveSection(index, delta);
		requestAnimationFrame(() =>
			document.querySelector<HTMLElement>(`[data-section-grip="${index + delta}"]`)?.focus()
		);
	}

	/** Sizes a textarea to its content so no inner scrollbar is needed, and keeps it that way. */
	function autosize(node: HTMLTextAreaElement, _value?: unknown) {
		let width = 0;
		const fit = () => {
			node.style.height = 'auto';
			// scrollHeight excludes the border, which border-box sizing needs back.
			node.style.height = `${node.scrollHeight + node.offsetHeight - node.clientHeight}px`;
		};
		fit();
		node.addEventListener('input', fit);
		// Wrapping changes with the width, so refit when it does.
		const observer = new ResizeObserver(() => {
			if (node.clientWidth === width) return;
			width = node.clientWidth;
			fit();
		});
		observer.observe(node);
		return {
			update: fit,
			destroy() {
				node.removeEventListener('input', fit);
				observer.disconnect();
			}
		};
	}
</script>

<div class="form stack">
	<section class="card stack">
		<input
			id="field-title"
			type="text"
			aria-label="Title"
			title="Title"
			value={textValue('title')}
			oninput={(event) => setField('title', event.currentTarget.value)}
		/>

		{#if template}
			{#each template.fields as field (field.key)}
				{#if field.key !== 'title'}
					<div class="field" class:with-icon={field.key === 'tags'}>
						{#if field.key === 'tags'}
							<span class="field-icon" title="Tags"><Icon name="tag" size={20} /></span>
						{/if}
						<div class="field-body">
						<label class="label" class:visually-hidden={field.key === 'tags'} for={fieldInputId(field)}>
							{field.label}{#if field.required}<span class="req">*</span>{/if}
						</label>

						{#if field.type === 'multi-enum'}
							<div class="options" id={fieldInputId(field)}>
								{#each field.options as option (option)}
									<button
										type="button"
										class="tag selectable"
										class:selected={listValue(field.key).some(
											(item) => item.toLowerCase() === option.toLowerCase()
										)}
										onclick={() => toggleListValue(field.key, option)}
									>
										{option}
									</button>
								{/each}
							</div>
							{#if field.allowCustom}
								<TagInput
									values={listValue(field.key)}
									placeholder="Add a custom value"
									onchange={(values) => setField(field.key, values)}
								/>
							{/if}
						{:else if field.type === 'enum'}
							<select
								id={fieldInputId(field)}
								value={textValue(field.key)}
								onchange={(event) => setField(field.key, event.currentTarget.value)}
							>
								<option value="">—</option>
								{#each field.options as option (option)}
									<option value={option}>{option}</option>
								{/each}
							</select>
						{:else if field.type === 'boolean'}
							<input
								id={fieldInputId(field)}
								type="checkbox"
								class="checkbox"
								checked={doc.fields[field.key] === true}
								onchange={(event) =>
									setField(field.key, event.currentTarget.checked ? true : '')}
							/>
						{:else if field.type === 'number'}
							<input
								id={fieldInputId(field)}
								type="number"
								value={textValue(field.key)}
								oninput={(event) =>
									setField(
										field.key,
										event.currentTarget.value === '' ? '' : Number(event.currentTarget.value)
									)}
							/>
						{:else}
							<input
								id={fieldInputId(field)}
								type="text"
								value={textValue(field.key)}
								oninput={(event) => setField(field.key, event.currentTarget.value)}
							/>
						{/if}

						{#if issueFor(field.key)}
							<p class="warn-text">{issueFor(field.key)}</p>
						{/if}
						</div>
					</div>
				{/if}
			{/each}
		{/if}

		{#if !template || !template.fields.some((field) => field.key === 'tags')}
			<div class="field with-icon">
				<span class="field-icon" title="Tags"><Icon name="tag" size={20} /></span>
				<div class="field-body">
					<label class="visually-hidden" for="field-tags">Tags</label>
					<TagInput
						id="field-tags"
						values={listValue('tags')}
						onchange={(values) => setField('tags', values)}
					/>
				</div>
			</div>
		{/if}
	</section>

	{#if doc.preamble.trim()}
		<section class="card stack">
			<h2>Introduction</h2>
			<textarea rows="3" use:autosize={doc.preamble} bind:value={doc.preamble}></textarea>
		</section>
	{/if}

	{#each doc.sections as section, sectionIndex (section)}
		<section
			class="card stack"
			role="group"
			aria-label={section.heading || 'Section'}
			class:dragging={dragIndex === sectionIndex}
			class:over={overIndex === sectionIndex && dragIndex !== sectionIndex}
			ondragover={(event) => onDragOver(event, sectionIndex)}
			ondrop={(event) => onDrop(event, sectionIndex)}
		>
			<header class="section-head">
				<button
					type="button"
					class="grip"
					draggable="true"
					data-section-grip={sectionIndex}
					title="Drag to reorder (or use Arrow Up/Down)"
					aria-label={`Reorder ${section.heading || 'section'}`}
					ondragstart={(event) => onDragStart(event, sectionIndex)}
					ondragend={onDragEnd}
					onkeydown={(event) => onGripKey(event, sectionIndex)}
				>
					<Icon name="grip" />
				</button>
				<input
					class="heading-input"
					type="text"
					bind:value={section.heading}
					aria-label="Section heading"
				/>
				<div
					class="type-toggle"
					role="radiogroup"
					aria-label="Section style"
					style:--i={SECTION_TYPES.findIndex((item) => item.value === section.type)}
				>
					<span class="thumb" aria-hidden="true"></span>
					{#each SECTION_TYPES as option (option.value)}
						<button
							type="button"
							role="radio"
							aria-checked={section.type === option.value}
							aria-label={option.label}
							title={option.label}
							tabindex={section.type === option.value ? 0 : -1}
							class:on={section.type === option.value}
							onclick={() => (section.type = option.value)}
							onkeydown={(event) => onTypeKey(event, section)}
						>
							<Icon name={option.value} size={15} />
						</button>
					{/each}
				</div>
				<button
					type="button"
					class="ghost danger remove"
					title="Remove section"
					aria-label="Remove section"
					onclick={() => removeSection(sectionIndex)}
				><Icon name="trash" /></button>
			</header>

			{#if !section.matched && template}
				<p class="muted small">
					Not described by the template. It is kept exactly as written.
				</p>
			{/if}

			{#each section.blocks as block, blockIndex (block)}
				<div class="block">
					{#if section.blocks.length > 1 || block.heading !== undefined}
						<div class="row">
							<input
								type="text"
								class="sub-input"
								placeholder={templateSectionFor(section)?.subheadingLabel ?? 'Sub-heading'}
								value={block.heading ?? ''}
								oninput={(event) => (block.heading = event.currentTarget.value)}
								aria-label="Sub-heading"
							/>
							<button
								type="button"
								class="ghost danger remove"
								title="Remove sub-section"
								aria-label="Remove sub-section"
								onclick={() => removeBlock(section, blockIndex)}
							><Icon name="trash" /></button>
						</div>
					{/if}

					{#if section.type === 'text'}
						<textarea
							rows="3"
							use:autosize={block.leadingText}
							placeholder={placeholderFor(section.type)}
							value={block.leadingText}
							oninput={(event) => (block.leadingText = event.currentTarget.value)}
						></textarea>
					{:else}
						{#if block.leadingText.trim()}
							<textarea
								rows="2"
								class="aside"
								use:autosize={block.leadingText}
								aria-label="Text before the list"
								value={block.leadingText}
								oninput={(event) => (block.leadingText = event.currentTarget.value)}
							></textarea>
						{/if}

						<textarea
							rows="3"
							use:autosize={block.items}
							placeholder={placeholderFor(section.type)}
							value={itemsToLines(block.items)}
							oninput={(event) => (block.items = linesToItems(event.currentTarget.value))}
						></textarea>
						<p class="muted small">
							Each line becomes {section.type === 'ordered' ? 'a numbered step' : 'a bullet'}.
						</p>

						{#if block.trailingText.trim()}
							<textarea
								rows="2"
								class="aside"
								use:autosize={block.trailingText}
								aria-label="Text after the list"
								value={block.trailingText}
								oninput={(event) => (block.trailingText = event.currentTarget.value)}
							></textarea>
						{/if}
					{/if}
				</div>
			{/each}

			<div>
				<button
					type="button"
					class="add-sub add-btn"
					title={`Add ${templateSectionFor(section)?.subheadingLabel ?? 'sub-section'}`}
					aria-label={`Add ${templateSectionFor(section)?.subheadingLabel ?? 'sub-section'}`}
					onclick={() => addBlock(section)}
				>
					<Icon name="plus" size={14} /><Icon name="subsection" />
				</button>
			</div>
		</section>
	{/each}

	{#if missingSections.length > 0}
		<section class="card stack">
			<h2>Add a section</h2>
			<div class="row wrap">
				{#each missingSections as section (section.id)}
					<button type="button" onclick={() => addSection(section)}>+ {section.heading}</button>
				{/each}
			</div>
		</section>
	{/if}

	<div>
		<button
			type="button"
			class="add-btn"
			title="Add section"
			aria-label="Add section"
			onclick={() =>
				doc.sections.push({
					heading: 'New section',
					type: 'list',
					matched: false,
					blocks: [{ items: [], leadingText: '', trailingText: '' }]
				})}
		>
			<Icon name="plus" size={14} /><Icon name="section" />
		</button>
	</div>
</div>

<style>
	h2 {
		font-size: 0.95rem;
		margin: 0;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.field.with-icon {
		flex-direction: row;
		align-items: flex-start;
		gap: 0.5rem;
	}
	.field-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.field-icon {
		display: inline-flex;
		align-items: center;
		/* Same height as a text input: 1.6 line-height + 0.45rem padding twice + 1px border twice. */
		height: calc(1.6rem + 0.9rem + 2px);
		color: var(--text-dim);
	}
	.label {
		font-size: 0.85rem;
		font-weight: 600;
	}
	.req {
		color: var(--danger);
		margin-left: 0.15rem;
	}

	.checkbox {
		width: auto;
	}

	.options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.selectable {
		cursor: pointer;
		width: auto;
		font-size: 0.78rem;
		padding: 0.12rem 0.55rem;
	}
	.selectable.selected {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}

	.section-head {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.heading-input {
		flex: 1 1 12rem;
		font-weight: 600;
	}
	.grip {
		width: auto;
		padding: 0.3rem 0.2rem;
		border: none;
		background: transparent;
		color: var(--text-dim);
		cursor: grab;
		touch-action: none;
		display: inline-flex;
	}
	.grip:hover {
		color: var(--accent);
		background: transparent;
	}
	.card.dragging {
		opacity: 0.45;
	}
	.card.over {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--accent);
	}

	.type-toggle {
		position: relative;
		display: inline-grid;
		grid-template-columns: repeat(3, 2rem);
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface-2);
		padding: 2px;
	}
	.type-toggle .thumb {
		position: absolute;
		top: 2px;
		bottom: 2px;
		left: 2px;
		width: 2rem;
		border-radius: 999px;
		background: var(--accent);
		transform: translateX(calc(var(--i) * 2rem));
		transition: transform 0.18s ease;
	}
	.type-toggle button {
		position: relative;
		width: 2rem;
		height: 1.6rem;
		padding: 0;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--text-dim);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.type-toggle button:hover {
		background: transparent;
		color: var(--text);
	}
	.type-toggle button.on {
		color: #fff;
	}
	@media (prefers-reduced-motion: reduce) {
		.type-toggle .thumb {
			transition: none;
		}
	}

	.remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: auto;
		padding: 0.25rem;
		line-height: 0;
		border-color: transparent;
	}
	.remove:hover:not(:disabled) {
		border-color: var(--danger);
	}
	/* Matches the type toggle beside it: 1.6rem button + 2px padding + 1px border, each side. */
	.section-head .remove {
		box-sizing: border-box;
		height: calc(1.6rem + 6px);
		padding: 0 0.5rem;
		border-color: var(--border);
	}

	.add-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		line-height: 0;
	}
	.add-sub {
		font-size: 0.85rem;
		padding: 0.3rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text);
		cursor: pointer;
	}
	.add-sub:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.sub-input {
		flex: 1;
	}

	.block {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding-left: 0.6rem;
		border-left: 2px solid var(--border);
	}

	textarea {
		font-family: var(--mono);
		font-size: 0.88rem;
		resize: vertical;
	}
	textarea.aside {
		font-family: inherit;
	}

	.small {
		font-size: 0.75rem;
		margin: 0;
	}
	.warn-text {
		font-size: 0.78rem;
		color: var(--warn);
		margin: 0;
	}

	.wrap {
		flex-wrap: wrap;
	}
</style>
