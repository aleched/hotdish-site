import type { DocSummary } from '#lib/markdown/doc.ts';

export interface TreeFolder {
	kind: 'folder';
	name: string;
	path: string;
	children: TreeNode[];
	/** Total documents in this folder and everything beneath it. */
	count: number;
}

export interface TreeFile {
	kind: 'file';
	name: string;
	path: string;
	doc: DocSummary;
}

export type TreeNode = TreeFolder | TreeFile;

/**
 * Builds a folder tree that mirrors the repository layout. Paths are relative to `basePath`
 * so a repo whose documents live in a sub-folder still browses from its own root.
 */
export function buildTree(docs: readonly DocSummary[], basePath = ''): TreeFolder {
	const prefix = basePath ? `${basePath.replace(/\/+$/, '')}/` : '';
	const root: TreeFolder = { kind: 'folder', name: '', path: '', children: [], count: 0 };

	for (const doc of docs) {
		if (prefix && !doc.path.startsWith(prefix)) continue;
		const relative = prefix ? doc.path.slice(prefix.length) : doc.path;
		const segments = relative.split('/').filter(Boolean);
		if (segments.length === 0) continue;

		let current = root;
		for (let i = 0; i < segments.length - 1; i++) {
			const name = segments[i];
			const path = current.path ? `${current.path}/${name}` : name;
			let next = current.children.find(
				(child): child is TreeFolder => child.kind === 'folder' && child.name === name
			);
			if (!next) {
				next = { kind: 'folder', name, path, children: [], count: 0 };
				current.children.push(next);
			}
			current = next;
		}

		const fileName = segments[segments.length - 1];
		current.children.push({
			kind: 'file',
			name: fileName,
			path: current.path ? `${current.path}/${fileName}` : fileName,
			doc
		});
	}

	countAndSort(root);
	return root;
}

/** Walks to a folder by its tree-relative path, or null when the path is not a folder. */
export function findFolder(root: TreeFolder, path: string): TreeFolder | null {
	if (!path) return root;
	let current: TreeFolder = root;
	for (const segment of path.split('/').filter(Boolean)) {
		const next = current.children.find(
			(child): child is TreeFolder => child.kind === 'folder' && child.name === segment
		);
		if (!next) return null;
		current = next;
	}
	return current;
}

function countAndSort(folder: TreeFolder): number {
	let count = 0;
	for (const child of folder.children) {
		count += child.kind === 'folder' ? countAndSort(child) : 1;
	}
	folder.count = count;

	folder.children.sort((a, b) => {
		if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
		const left = a.kind === 'file' ? a.doc.title : a.name;
		const right = b.kind === 'file' ? b.doc.title : b.name;
		return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
	});

	return count;
}
