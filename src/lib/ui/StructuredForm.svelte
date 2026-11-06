<script lang="ts">
	import type { StructuredDoc, StructuredSection } from '$lib/template/parse';
	import { itemsToLines, linesToItems } from '$lib/template/serialize';
	import type {
		DocTemplate,
		SectionType,
		TemplateField,
		TemplateSection
	} from '$lib/template/schema';
	import { validateFields } from '$lib/template/schema';
	import { editorPrefs } from '$lib/store/editorPrefs.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import type { IconName } from '$lib/ui/icon-names';
	import LineNumberedTextarea from '$lib/ui/LineNumberedTextarea.svelte';
	import TagInput from '$lib/ui/TagInput.svelte';
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		doc: StructuredDoc;
		template: DocTemplate | null;
		/** Show only the title, tags and details card (used above the rich text editor). */
		headerOnly?: boolean;
	}

	let { doc, template, headerOnly = false }: Props = $props();

	// svelte-ignore state_referenced_locally
	let introOpen = $state(Boolean(doc.preamble.trim()));

	function openIntro() {
		introOpen = true;
		requestAnimationFrame(() =>
			document.querySelector<HTMLTextAreaElement>('textarea[data-intro]')?.focus()
		);
	}

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

	function fieldIcon(field: TemplateField): IconName | undefined {
		return field.icon ?? (field.key === 'tags' ? 'tag' : undefined);
	}

	/** Single-line fields with an icon drop the visible label and use it as the placeholder instead. */
	function compact(field: TemplateField): boolean {
		return field.key === 'tags' || (!!field.icon && ['text', 'number', 'url'].includes(field.type));
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
		if (type === 'ordered') return m.form_one_item();
		if (type === 'list') return m.form_one_bullet();
		return m.form_notes();
	}

	function fieldInputId(field: TemplateField): string {
		return `field-${field.key}`;
	}

	const SECTION_TYPES: { value: SectionType; label: string }[] = [
		{ value: 'text', label: m.form_type_text() },
		{ value: 'list', label: m.form_type_list() },
		{ value: 'ordered', label: m.form_type_ordered() }
	];

	function setType(section: StructuredSection, type: SectionType) {
		if (type === 'text' && section.type !== 'text') {
			// Free text has no list, so fold list items (and surrounding text) into the text itself.
			for (const block of section.blocks) {
				const bullets = itemsToLines(block.items);
				block.leadingText = [block.leadingText.trim(), bullets, block.trailingText.trim()]
					.filter(Boolean)
					.join('\n');
				block.items = [];
				block.trailingText = '';
			}
		} else if (type !== 'text' && section.type === 'text') {
			// Free text becomes list items, one per line.
			for (const block of section.blocks) {
				block.items = [...linesToItems(block.leadingText), ...block.items];
				block.leadingText = '';
			}
		}
		section.type = type;
	}

	function onTypeKey(event: KeyboardEvent, section: StructuredSection) {
		const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
		if (!step) return;
		event.preventDefault();
		const current = SECTION_TYPES.findIndex((item) => item.value === section.type);
		const next = (current + step + SECTION_TYPES.length) % SECTION_TYPES.length;
		setType(section, SECTION_TYPES[next].value);
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
</script>

<div class="form stack" spellcheck={editorPrefs.spellcheck}>
	<section class="card stack">
		<input
			id="field-title"
			type="text"
			aria-label={m.form_title()}
			title={m.form_title()}
			placeholder={m.form_title()}
			value={textValue('title')}
			oninput={(event) => setField('title', event.currentTarget.value)}
		/>

		{#if template}
			{#snippet fieldBlock(field: TemplateField)}
					<div class="field" class:with-icon={!!fieldIcon(field) && compact(field)}>
						{#if fieldIcon(field) && compact(field)}
							<span class="field-icon" title={field.key === 'tags' ? m.filter_tags() : field.label}>
								<Icon name={fieldIcon(field)!} size={field.key === 'tags' ? 20 : 18} />
							</span>
						{/if}
						<div class="field-body">
						<label class="label" class:visually-hidden={compact(field)} for={fieldInputId(field)}>
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
									placeholder={m.form_custom_value()}
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
								title={compact(field) ? field.label : undefined}
								placeholder={compact(field) ? field.label : undefined}
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
								title={compact(field) ? field.label : undefined}
								placeholder={compact(field) ? field.label : undefined}
								value={textValue(field.key)}
								oninput={(event) => setField(field.key, event.currentTarget.value)}
							/>
						{/if}

						{#if issueFor(field.key)}
							<p class="warn-text">{issueFor(field.key)}</p>
						{/if}
						</div>
					</div>
			{/snippet}

			{#each template.layout as row (row[0].key)}
				{@const shown = row.filter((field) => field.key !== 'title')}
				{#if shown.length > 1}
					<div class="field-row" style:--cols={shown.length}>
						{#each shown as field (field.key)}
							{@render fieldBlock(field)}
						{/each}
					</div>
				{:else}
					{#each shown as field (field.key)}
						{@render fieldBlock(field)}
					{/each}
				{/if}
			{/each}
		{/if}

		{#if !template || !template.fields.some((field) => field.key === 'tags')}
			<div class="field with-icon">
				<span class="field-icon" title={m.filter_tags()}><Icon name="tag" size={20} /></span>
				<div class="field-body">
					<label class="visually-hidden" for="field-tags">{m.filter_tags()}</label>
					<TagInput
						id="field-tags"
						values={listValue('tags')}
						onchange={(values) => setField('tags', values)}
					/>
				</div>
			</div>
		{/if}
	</section>

	{#if !headerOnly}
	{#if introOpen}
		<section class="card stack">
			<LineNumberedTextarea
				rows={3}
				fit
				gutter="dash"
				bind:value={doc.preamble}
				aria-label={m.form_intro()}
				data-intro
				onblur={() => {
					if (!doc.preamble.trim()) introOpen = false;
				}}
				placeholder={m.form_intro()}
			/>
		</section>
	{:else}
		<button
			type="button"
			class="add-intro"
			title={m.form_add_intro()}
			aria-label={m.form_add_intro()}
			onclick={openIntro}
		>
			<Icon name="plus" size={12} />
			<span class="rule"></span>
		</button>
	{/if}

	{#each doc.sections as section, sectionIndex (section)}
		<section
			class="card stack"
			role="group"
			aria-label={section.heading || m.form_section()}
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
					title={m.form_drag_hint()}
					aria-label={m.form_reorder({ name: section.heading || m.form_section() })}
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
					aria-label={m.form_section_heading()}
				/>
				<div
					class="type-toggle"
					role="radiogroup"
					aria-label={m.form_section_style()}
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
							onclick={() => setType(section, option.value)}
							onkeydown={(event) => onTypeKey(event, section)}
						>
							<Icon name={option.value} size={15} />
						</button>
					{/each}
				</div>
				<button
					type="button"
					class="ghost danger remove"
					title={m.form_remove_section()}
					aria-label={m.form_remove_section()}
					onclick={() => removeSection(sectionIndex)}
				><Icon name="trash" /></button>
			</header>

			{#if !section.matched && template}
				<p class="muted small">
					{m.form_unmatched()}
				</p>
			{/if}

			{#each section.blocks as block, blockIndex (block)}
				<div class="block" class:grouped={section.blocks.length > 1}>
					{#if section.blocks.length > 1 || block.heading !== undefined}
						<div class="row">
							<input
								type="text"
								class="sub-input"
								placeholder={templateSectionFor(section)?.subheadingLabel ?? m.form_subheading()}
								value={block.heading ?? ''}
								oninput={(event) => (block.heading = event.currentTarget.value)}
																aria-label={m.form_subheading()}
							/>
							<button
								type="button"
								class="ghost danger remove"
																title={m.form_remove_subsection()}
																aria-label={m.form_remove_subsection()}
								onclick={() => removeBlock(section, blockIndex)}
							><Icon name="trash" /></button>
						</div>
					{/if}

					{#if section.type === 'text'}
						<LineNumberedTextarea
							rows={3}
							fit
							gutter="dash"
							placeholder={placeholderFor(section.type)}
							value={block.leadingText}
							oninput={(event) => (block.leadingText = event.currentTarget.value)}
						/>
					{:else}
						{#if block.leadingText.trim()}
							<LineNumberedTextarea
								rows={2}
								fit
								gutter="dash"
								mono={false}
								aria-label={m.form_text_before()}
								value={block.leadingText}
								oninput={(event) => (block.leadingText = event.currentTarget.value)}
							/>
						{/if}

						<LineNumberedTextarea
							rows={3}
							fit
							gutter={section.type === 'list' ? 'bullet' : 'number'}
							placeholder={placeholderFor(section.type)}
							value={itemsToLines(block.items)}
							oninput={(event) => (block.items = linesToItems(event.currentTarget.value))}
						/>

						{#if block.trailingText.trim()}
							<LineNumberedTextarea
								rows={2}
								fit
								gutter="dash"
								mono={false}
								aria-label={m.form_text_after()}
								value={block.trailingText}
								oninput={(event) => (block.trailingText = event.currentTarget.value)}
							/>
						{/if}
					{/if}
				</div>
			{/each}

			<div>
				<button
					type="button"
					class="add-sub add-btn"
					title={templateSectionFor(section)?.subheadingLabel ? m.form_add_named({ name: templateSectionFor(section)!.subheadingLabel! }) : m.form_add_subsection()}
					aria-label={templateSectionFor(section)?.subheadingLabel ? m.form_add_named({ name: templateSectionFor(section)!.subheadingLabel! }) : m.form_add_subsection()}
					onclick={() => addBlock(section)}
				>
					<Icon name="plus" size={14} /><Icon name="subsection" />
				</button>
			</div>
		</section>
	{/each}

	{#if missingSections.length > 0}
		<section class="card stack">
			<h2 title={m.form_add_a_section()}>
				<Icon name="plus" size={20} /><span class="visually-hidden">{m.form_add_a_section()}</span>
			</h2>
			<div class="row wrap">
				{#each missingSections as section (section.id)}
					<button
						type="button"
						class="add-section"
						onclick={() => addSection(section)}
					>
						<Icon name="plus" size={14} />{section.heading}
					</button>
				{/each}
			</div>
		</section>
	{/if}

	<div>
		<button
			type="button"
			class="add-btn"
			title={m.form_add_section()}
			aria-label={m.form_add_section()}
			onclick={() =>
				doc.sections.push({
					heading: m.form_new_section(),
					type: 'list',
					matched: false,
					blocks: [{ items: [], leadingText: '', trailingText: '' }]
				})}
		>
			<Icon name="plus" size={14} /><Icon name="section" />
		</button>
	</div>
	{/if}
</div>

<style>
	.add-section {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	h2 {
		font-size: 0.95rem;
		margin: 0;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.field-row {
		display: grid;
		grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
		gap: 0.5rem;
	}
	@media (max-width: 560px) {
		.field-row {
			grid-template-columns: 1fr;
		}
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
	}
	.block.grouped {
		padding-left: 0.6rem;
		border-left: 2px solid var(--border);
	}

	.add-intro {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0;
		line-height: 1;
		background: none;
		border: none;
		color: var(--text-dim);
		opacity: 0.6;
	}
	.add-intro .rule {
		flex: 1;
		height: 1px;
		background: var(--border);
	}
	.add-intro:hover,
	.add-intro:focus-visible {
		opacity: 1;
		color: var(--accent);
		background: none;
	}
	.add-intro:hover .rule,
	.add-intro:focus-visible .rule {
		background: var(--accent);
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
