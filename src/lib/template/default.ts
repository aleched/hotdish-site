import recipeYaml from './recipe.yml?raw';
import noteYaml from './note.yml?raw';
import { parseTemplate, type DocTemplate } from './schema';

export type DefaultTemplateId = 'recipe' | 'note';

const SOURCES: Record<DefaultTemplateId, string> = { recipe: recipeYaml, note: noteYaml };

const cache = new Map<DefaultTemplateId, DocTemplate | null>();

/** The shared example files double as the built-in defaults. Parsed lazily so messages are ready. */
export function getDefaultTemplate(id: DefaultTemplateId = 'recipe'): DocTemplate | null {
	if (!cache.has(id)) cache.set(id, parseTemplate(SOURCES[id]).template);
	return cache.get(id) ?? null;
}

export { recipeYaml as defaultTemplateYaml, noteYaml as noteTemplateYaml };
