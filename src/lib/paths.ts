import { m } from '#lib/paraglide/messages.js';

/** Path and commit-message helpers shared by the create, move and delete flows. */

/** Lowercase hyphenated slug; apostrophes are dropped (`Tsao's` -> `tsaos`) and `&` reads as `and`. */
export function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/['\u2018\u2019]/g, '')
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function withMarkdownExtension(name: string): string {
	if (!name) return '';
	return /\.(md|markdown)$/i.test(name) ? name : `${name}.md`;
}

/**
 * Cleans a user-typed folder path: trims whitespace around segments, collapses repeated or
 * backward slashes and drops leading/trailing slashes. `.` and `..` segments are rejected
 * by `folderError` rather than resolved, so the result is always a literal path.
 */
export function normalizeFolder(value: string): string {
	return value
		.replace(/\\/g, '/')
		.split('/')
		.map((segment) => segment.trim())
		.filter(Boolean)
		.join('/');
}

/** Returns a reason the folder path is unusable, or null when it is fine. */
export function folderError(folder: string): string | null {
	const segments = normalizeFolder(folder).split('/').filter(Boolean);
	if (segments.some((segment) => segment === '.' || segment === '..')) {
		return m.path_folder_dots();
	}
	if (segments.some((segment) => segment.startsWith('.'))) {
		return m.path_folder_hidden();
	}
	return null;
}

/** Returns a reason the file name is unusable, or null when it is fine. */
export function fileNameError(name: string): string | null {
	const trimmed = name.trim();
	if (!trimmed) return m.path_name_required();
	if (/[\\/]/.test(trimmed)) return m.path_name_slash();
	if (trimmed.startsWith('.')) return m.path_name_dot();
	return null;
}

export function joinPath(...parts: string[]): string {
	return parts
		.map((part) => part.replace(/^\/+|\/+$/g, ''))
		.filter(Boolean)
		.join('/');
}

export function parentFolder(path: string): string {
	const index = path.lastIndexOf('/');
	return index === -1 ? '' : path.slice(0, index);
}

export function baseName(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1);
}

/** Converts a repository path to the path used in document URLs (relative to the base path). */
export function toRelative(fullPath: string, basePath: string): string {
	const base = basePath.replace(/^\/+|\/+$/g, '');
	if (!base) return fullPath;
	return fullPath.startsWith(`${base}/`) ? fullPath.slice(base.length + 1) : fullPath;
}

export function toFull(relativePath: string, basePath: string): string {
	return joinPath(basePath, relativePath);
}

/** Encodes each segment of a document path for use in a URL, keeping the slashes. */
export function encodeDocPath(path: string): string {
	return path.split('/').map(encodeURIComponent).join('/');
}

export const commitMessages = {
	create: (title: string) => `Create ${title}`,
	update: (title: string) => `Update ${title}`,
	delete: (title: string) => `Delete ${title}`,
	/** Folders are relative to the base path; an empty folder is the repository root. */
	move(title: string, fromRelative: string, toRelative: string): string {
		const fromFolder = parentFolder(fromRelative);
		const toFolder = parentFolder(toRelative);
		if (fromFolder === toFolder) return `Rename ${title} to ${baseName(toRelative)}`;
		return `Move ${title} to ${toFolder || 'top level'}`;
	}
};
