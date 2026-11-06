import templateYaml from './template.example.yml?raw';
import { parseTemplate, type DocTemplate } from './schema';

let cached: DocTemplate | null | undefined;

/** The shared example file doubles as the default for repositories without a template. Parsed lazily so messages are ready. */
export function getDefaultTemplate(): DocTemplate | null {
	if (cached === undefined) cached = parseTemplate(templateYaml).template;
	return cached;
}

export { templateYaml as defaultTemplateYaml };
