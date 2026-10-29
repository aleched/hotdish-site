<script lang="ts">
	import type { StructuredDoc, StructuredSection } from '$lib/template/parse';
	import { itemsToLines, linesToItems } from '$lib/template/serialize';
	import type { RecipeTemplate, TemplateField, TemplateSection } from '$lib/template/schema';
	import { validateFields } from '$lib/template/schema';

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
</script>

<div class="form stack">
	<section class="card stack">
		<h2>Details</h2>

		<div class="field">
			<label class="label" for="field-title">Title</label>
			<input
				id="field-title"
				type="text"
				value={textValue('title')}
				oninput={(event) => setField('title', event.currentTarget.value)}
			/>
		</div>

		{#if template}
			{#each template.fields as field (field.key)}
				{#if field.key !== 'title'}
					<div class="field">
						<label class="label" for={fieldInputId(field)}>
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
								<input
									type="text"
									placeholder="Comma separated, custom values allowed"
									value={listValue(field.key).join(', ')}
									oninput={(event) =>
										setField(
											field.key,
											event.currentTarget.value
												.split(',')
												.map((item) => item.trim())
												.filter(Boolean)
										)}
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
				{/if}
			{/each}
		{/if}

		{#if !template || !template.fields.some((field) => field.key === 'tags')}
			<div class="field">
				<label class="label" for="field-tags">Tags</label>
				<input
					id="field-tags"
					type="text"
					placeholder="comma separated"
					value={listValue('tags').join(', ')}
					oninput={(event) =>
						setField(
							'tags',
							event.currentTarget.value
								.split(',')
								.map((item) => item.trim())
								.filter(Boolean)
						)}
				/>
			</div>
		{/if}
	</section>

	{#if doc.preamble.trim()}
		<section class="card stack">
			<h2>Introduction</h2>
			<textarea rows="3" bind:value={doc.preamble}></textarea>
		</section>
	{/if}

	{#each doc.sections as section, sectionIndex (section)}
		<section class="card stack">
			<header class="section-head">
				<input
					class="heading-input"
					type="text"
					bind:value={section.heading}
					aria-label="Section heading"
				/>
				<select bind:value={section.type} aria-label="Section style">
					<option value="list">Bulleted</option>
					<option value="ordered">Numbered</option>
					<option value="text">Free text</option>
				</select>
				<div class="row">
					<button
						type="button"
						class="ghost"
						title="Move up"
						onclick={() => moveSection(sectionIndex, -1)}
					>↑</button>
					<button
						type="button"
						class="ghost"
						title="Move down"
						onclick={() => moveSection(sectionIndex, 1)}
					>↓</button>
					<button
						type="button"
						class="ghost danger"
						title="Remove section"
						onclick={() => removeSection(sectionIndex)}
					>✕</button>
				</div>
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
								class="ghost danger"
								title="Remove"
								onclick={() => removeBlock(section, blockIndex)}
							>✕</button>
						</div>
					{/if}

					{#if section.type === 'text'}
						<textarea
							rows="5"
							placeholder={placeholderFor(section.type)}
							value={block.leadingText}
							oninput={(event) => (block.leadingText = event.currentTarget.value)}
						></textarea>
					{:else}
						{#if block.leadingText.trim()}
							<textarea
								rows="2"
								class="aside"
								aria-label="Text before the list"
								value={block.leadingText}
								oninput={(event) => (block.leadingText = event.currentTarget.value)}
							></textarea>
						{/if}

						<textarea
							rows={Math.max(4, block.items.length + 1)}
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
								aria-label="Text after the list"
								value={block.trailingText}
								oninput={(event) => (block.trailingText = event.currentTarget.value)}
							></textarea>
						{/if}
					{/if}
				</div>
			{/each}

			<div>
				<button type="button" class="link" onclick={() => addBlock(section)}>
					+ Add {templateSectionFor(section)?.subheadingLabel ?? 'sub-section'}
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
			onclick={() =>
				doc.sections.push({
					heading: 'New section',
					type: 'list',
					matched: false,
					blocks: [{ items: [], leadingText: '', trailingText: '' }]
				})}
		>
			+ Add custom section
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
	.section-head select {
		width: auto;
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
