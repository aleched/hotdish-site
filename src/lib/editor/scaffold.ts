import { serializeFrontmatter } from '$lib/markdown/frontmatter';
import type { DocTemplate } from '$lib/template/schema';

/** Starting markdown for a new document: empty frontmatter plus the template's required sections. */
export function scaffoldDoc(template: DocTemplate | null): string {
	const fields: Record<string, unknown> = { title: '' };
	if (!template || template.fields.some((field) => field.key === 'tags')) fields.tags = [];

	const sections = (template?.sections ?? [
		{ heading: 'Ingredients', type: 'list' as const },
		{ heading: 'Instructions', type: 'ordered' as const }
	])
		.filter((section) => !('optional' in section && section.optional))
		.map((section) => `## ${section.heading}\n`)
		.join('\n');

	return serializeFrontmatter(fields, `${sections}\n`);
}
