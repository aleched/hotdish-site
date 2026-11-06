import { serializeFrontmatter } from '#lib/markdown/frontmatter.ts';
import type { DocTemplate } from '#lib/template/schema.ts';

/** Starting markdown for a new document: empty frontmatter plus the template's required sections. */
export function scaffoldDoc(template: DocTemplate | null): string {
	const fields: Record<string, unknown> = { title: '' };
	if (!template || template.fields.some((field) => field.key === 'tags')) fields.tags = [];

	const sections = (template?.sections ?? [])
		.filter((section) => !section.optional)
		.map((section) => `## ${section.heading}\n`)
		.join('\n');

	return serializeFrontmatter(fields, `${sections}\n`);
}
