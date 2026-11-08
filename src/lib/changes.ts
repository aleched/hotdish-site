import type { BlobEntry, FileOp } from '#lib/forge/types.ts';
import { baseName } from '#lib/paths.ts';

export type ChangeKind = 'add' | 'edit' | 'delete' | 'move';

/**
 * A change saved on this device but not yet committed. One record per file, keyed by `path`;
 * successive edits collapse into a single record so a commit holds each file once.
 */
export interface PendingChange {
	kind: ChangeKind;
	/** Path the file has after the change; for a delete, the path being deleted. */
	path: string;
	/** Original path of a moved file. */
	from?: string;
	/** Content after the change. Absent for deletes. */
	raw?: string;
	/** Sha the original file had when first changed. Absent for adds. */
	baseSha?: string;
	/** Original content, kept for diffs. Absent for adds. */
	baseRaw?: string;
	savedAt: number;
}

export interface BaseFile {
	sha: string;
	raw: string;
}

const LOCAL_PREFIX = 'local:';

/** Stable id for locally changed content. The path is included so identical copies stay distinct. */
export function localSha(path: string, raw: string): string {
	let hash = 0x811c9dc5;
	const text = `${path}\u0000${raw}`;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `${LOCAL_PREFIX}${hash.toString(16)}-${text.length}`;
}

export function isLocalSha(sha: string): boolean {
	return sha.startsWith(LOCAL_PREFIX);
}

/** Drops records that no longer differ from the repository. */
function normalize(change: PendingChange): PendingChange | null {
	let next = change;
	if (next.kind === 'move' && next.from === next.path) next = { ...next, kind: 'edit', from: undefined };
	if (next.kind === 'edit' && next.raw === next.baseRaw) return null;
	return next;
}

function put(list: PendingChange[], remove: string[], change: PendingChange | null): PendingChange[] {
	const rest = list.filter((item) => !remove.includes(item.path));
	if (!change) return rest;
	return [...rest, change];
}

export function findChange(list: PendingChange[], path: string): PendingChange | undefined {
	return list.find((item) => item.path === path);
}

/** Records new content for a file at `path` (its current path, which may itself be pending). */
export function stageEdit(list: PendingChange[], path: string, raw: string, base: BaseFile, now = Date.now()): PendingChange[] {
	const existing = findChange(list, path);
	const change: PendingChange = existing
		? { ...existing, raw, savedAt: now }
		: { kind: 'edit', path, raw, baseSha: base.sha, baseRaw: base.raw, savedAt: now };
	return put(list, [path], normalize(change));
}

export function stageAdd(list: PendingChange[], path: string, raw: string, now = Date.now()): PendingChange[] {
	const existing = findChange(list, path);
	// Re-creating a file that was deleted locally is just an edit of the original.
	if (existing?.kind === 'delete') {
		const change: PendingChange = { ...existing, kind: 'edit', raw, savedAt: now };
		return put(list, [path], normalize(change));
	}
	return put(list, [path], { kind: 'add', path, raw, savedAt: now });
}

export function stageDelete(list: PendingChange[], path: string, base: BaseFile, now = Date.now()): PendingChange[] {
	const existing = findChange(list, path);
	if (!existing) {
		return put(list, [], { kind: 'delete', path, baseSha: base.sha, baseRaw: base.raw, savedAt: now });
	}
	if (existing.kind === 'add') return put(list, [path], null);
	if (existing.kind === 'move') {
		const from = existing.from ?? path;
		return put(list, [path], {
			kind: 'delete',
			path: from,
			baseSha: existing.baseSha,
			baseRaw: existing.baseRaw,
			savedAt: now
		});
	}
	return put(list, [path], { kind: 'delete', path, baseSha: existing.baseSha, baseRaw: existing.baseRaw, savedAt: now });
}

/** Moves a file to `to`, carrying `raw` (the content it has after the move). */
export function stageMove(list: PendingChange[], from: string, to: string, raw: string, base: BaseFile, now = Date.now()): PendingChange[] {
	const existing = findChange(list, from);
	if (existing?.kind === 'add') return put(list, [from, to], { kind: 'add', path: to, raw, savedAt: now });
	const change: PendingChange = existing
		? { ...existing, kind: 'move', from: existing.from ?? from, path: to, raw, savedAt: now }
		: { kind: 'move', from, path: to, raw, baseSha: base.sha, baseRaw: base.raw, savedAt: now };
	return put(list, [from, to], normalize(change));
}

export function discardChange(list: PendingChange[], path: string): PendingChange[] {
	return list.filter((item) => item.path !== path);
}

/** Drops the changes that were committed; anything re-staged since keeps its newer record. */
export function withoutChanges(list: PendingChange[], committed: PendingChange[]): PendingChange[] {
	const done = new Set(committed.map((change) => `${change.path}\n${change.savedAt}`));
	return list.filter((item) => !done.has(`${item.path}\n${item.savedAt}`));
}

/** The listing as the user sees it: the repository with pending changes applied. */
export function overlayEntries(base: BlobEntry[], list: PendingChange[]): BlobEntry[] {
	if (list.length === 0) return base;
	const map = new Map(base.map((entry) => [entry.path, entry]));
	for (const change of list) {
		if (change.kind === 'delete') map.delete(change.path);
		else if (change.kind === 'move' && change.from) map.delete(change.from);
	}
	for (const change of list) {
		if (change.kind === 'delete' || change.raw === undefined) continue;
		map.set(change.path, { path: change.path, sha: localSha(change.path, change.raw) });
	}
	return [...map.values()];
}

/** Content of locally changed files by their local sha. */
export function localContents(list: PendingChange[]): Map<string, string> {
	const result = new Map<string, string>();
	for (const change of list) {
		if (change.raw !== undefined) result.set(localSha(change.path, change.raw), change.raw);
	}
	return result;
}

export type ConflictKind = 'remote-changed' | 'remote-deleted' | 'remote-exists';

export interface ChangeStatus {
	change: PendingChange;
	conflict?: ConflictKind;
	/** Current sha of the file the change starts from, when it exists on the branch. */
	remoteSha?: string;
	/** Current sha of the destination, when a move or add lands on an existing file. */
	targetSha?: string;
}

/** Compares each change's starting point with the branch as it is now. */
export function analyzeChanges(list: PendingChange[], remote: BlobEntry[]): ChangeStatus[] {
	const shas = new Map(remote.map((entry) => [entry.path, entry.sha]));
	return list.map((change): ChangeStatus => {
		switch (change.kind) {
			case 'add': {
				const existing = shas.get(change.path);
				return existing === undefined ? { change } : { change, conflict: 'remote-exists', targetSha: existing };
			}
			case 'edit':
			case 'delete': {
				const current = shas.get(change.path);
				if (current === undefined) {
					return change.kind === 'delete' ? { change } : { change, conflict: 'remote-deleted' };
				}
				return current === change.baseSha ? { change, remoteSha: current } : { change, conflict: 'remote-changed', remoteSha: current };
			}
			case 'move': {
				const current = change.from ? shas.get(change.from) : undefined;
				const target = shas.get(change.path);
				if (current === undefined) return { change, conflict: 'remote-deleted', targetSha: target };
				if (current !== change.baseSha) return { change, conflict: 'remote-changed', remoteSha: current, targetSha: target };
				return target === undefined ? { change, remoteSha: current } : { change, conflict: 'remote-exists', remoteSha: current, targetSha: target };
			}
		}
	});
}

/** Turns the changes into file operations on the current branch tip; conflicts resolve as "keep mine". */
export function buildFileOps(statuses: ChangeStatus[]): FileOp[] {
	const ops: FileOp[] = [];
	for (const { change, remoteSha, targetSha } of statuses) {
		const write = (sha: string | undefined): FileOp =>
			sha ? { op: 'update', path: change.path, content: change.raw ?? '', sha } : { op: 'create', path: change.path, content: change.raw ?? '' };
		if (change.kind === 'add') ops.push(write(targetSha));
		else if (change.kind === 'edit') ops.push(write(remoteSha));
		else if (change.kind === 'delete') {
			if (remoteSha) ops.push({ op: 'delete', path: change.path, sha: remoteSha });
		} else {
			if (change.from && remoteSha) ops.push({ op: 'delete', path: change.from, sha: remoteSha });
			ops.push(write(targetSha));
		}
	}
	return ops;
}

function label(change: PendingChange): string {
	return baseName(change.path).replace(/\.md$/i, '');
}

/** Default message: the single change in words, or a heading plus one line per file. */
export function defaultCommitMessage(list: PendingChange[]): string {
	const line = (change: PendingChange): string => {
		switch (change.kind) {
			case 'add':
				return `Create ${label(change)}`;
			case 'edit':
				return `Update ${label(change)}`;
			case 'delete':
				return `Delete ${label(change)}`;
			case 'move':
				return `Move ${label(change)} to ${change.path}`;
		}
	};
	if (list.length === 0) return '';
	if (list.length === 1) return line(list[0]);
	return `Update ${list.length} files\n\n${list.map((change) => `- ${line(change)}`).join('\n')}`;
}
