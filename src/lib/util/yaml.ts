import { load, loadAll, type LoadOptions } from 'js-yaml';

/**
 * Parses a single YAML document. Unlike js-yaml's `load()`, an empty or comment-only source
 * gives `undefined` instead of throwing; several documents still throw.
 */
export function loadYaml(text: string, options?: LoadOptions): unknown {
	const documents = loadAll(text, options);
	if (documents.length > 1) return load(text, options);
	return documents[0];
}
