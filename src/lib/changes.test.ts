import { describe, expect, it } from 'vitest';
import {
	analyzeChanges,
	buildFileOps,
	defaultCommitMessage,
	discardChange,
	isLocalSha,
	localContents,
	localSha,
	overlayEntries,
	stageAdd,
	stageDelete,
	stageEdit,
	stageMove,
	withoutChanges,
	type PendingChange
} from './changes';

const base = { sha: 'aaa', raw: 'old\n' };

describe('staging', () => {
	it('collapses repeated edits into one record', () => {
		let list: PendingChange[] = [];
		list = stageEdit(list, 'a.md', 'one\n', base);
		list = stageEdit(list, 'a.md', 'two\n', base);
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({ kind: 'edit', raw: 'two\n', baseSha: 'aaa', baseRaw: 'old\n' });
	});

	it('drops an edit that returns to the original content', () => {
		let list = stageEdit([], 'a.md', 'one\n', base);
		list = stageEdit(list, 'a.md', 'old\n', base);
		expect(list).toEqual([]);
	});

	it('keeps an edited new file as an add', () => {
		let list = stageAdd([], 'n.md', 'x\n');
		list = stageEdit(list, 'n.md', 'y\n', base);
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({ kind: 'add', raw: 'y\n' });
	});

	it('cancels an add that is deleted', () => {
		const list = stageDelete(stageAdd([], 'n.md', 'x\n'), 'n.md', base);
		expect(list).toEqual([]);
	});

	it('turns edit then delete into a delete of the original', () => {
		const list = stageDelete(stageEdit([], 'a.md', 'one\n', base), 'a.md', base);
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({ kind: 'delete', path: 'a.md', baseSha: 'aaa' });
	});

	it('turns delete then re-create into an edit', () => {
		let list = stageDelete([], 'a.md', base);
		list = stageAdd(list, 'a.md', 'new\n');
		expect(list[0]).toMatchObject({ kind: 'edit', raw: 'new\n', baseSha: 'aaa' });
	});

	it('chains moves back to the original path', () => {
		let list = stageMove([], 'a.md', 'b.md', 'old\n', base);
		expect(list[0]).toMatchObject({ kind: 'move', from: 'a.md', path: 'b.md' });
		list = stageMove(list, 'b.md', 'c.md', 'old\n', base);
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({ from: 'a.md', path: 'c.md' });
		list = stageMove(list, 'c.md', 'a.md', 'old\n', base);
		expect(list).toEqual([]);
	});

	it('deleting a moved file deletes the original', () => {
		const list = stageDelete(stageMove([], 'a.md', 'b.md', 'old\n', base), 'b.md', base);
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({ kind: 'delete', path: 'a.md', baseSha: 'aaa' });
	});

	it('discards by path', () => {
		const list = stageEdit([], 'a.md', 'one\n', base);
		expect(discardChange(list, 'a.md')).toEqual([]);
	});

	it('removes only the committed changes', () => {
		const a = stageEdit([], 'a.md', 'one\n', base, 1);
		const list = stageAdd(a, 'n.md', 'x\n', 2);
		expect(withoutChanges(list, [list[0]])).toEqual([list[1]]);
	});

	it('keeps a change re-staged after it was committed', () => {
		const committed = stageEdit([], 'a.md', 'one\n', base, 1);
		const list = stageEdit(committed, 'a.md', 'two\n', base, 2);
		expect(withoutChanges(list, committed)).toEqual(list);
	});
});

describe('overlay', () => {
	const entries = [
		{ path: 'a.md', sha: 'aaa' },
		{ path: 'b.md', sha: 'bbb' },
		{ path: 'c.md', sha: 'ccc' }
	];

	it('applies edits, adds, deletes and moves', () => {
		let list = stageEdit([], 'a.md', 'edited\n', base);
		list = stageDelete(list, 'b.md', { sha: 'bbb', raw: '' });
		list = stageMove(list, 'c.md', 'd.md', 'moved\n', { sha: 'ccc', raw: '' });
		list = stageAdd(list, 'e.md', 'new\n');
		const result = overlayEntries(entries, list);
		expect(result.map((entry) => entry.path).sort()).toEqual(['a.md', 'd.md', 'e.md']);
		expect(isLocalSha(result.find((entry) => entry.path === 'a.md')!.sha)).toBe(true);
	});

	it('returns the repository listing when nothing is pending', () => {
		expect(overlayEntries(entries, [])).toBe(entries);
	});

	it('maps local shas to content', () => {
		const list = stageEdit([], 'a.md', 'edited\n', base);
		expect(localContents(list).get(localSha('a.md', 'edited\n'))).toBe('edited\n');
	});

	it('gives identical content at different paths different shas', () => {
		expect(localSha('a.md', 'x')).not.toBe(localSha('b.md', 'x'));
	});
});

describe('analysis and ops', () => {
	const remote = [
		{ path: 'a.md', sha: 'aaa' },
		{ path: 'b.md', sha: 'new-b' }
	];

	it('treats unchanged starting points as clean', () => {
		const statuses = analyzeChanges(stageEdit([], 'a.md', 'x\n', base), remote);
		expect(statuses[0].conflict).toBeUndefined();
		expect(buildFileOps(statuses)).toEqual([{ op: 'update', path: 'a.md', content: 'x\n', sha: 'aaa' }]);
	});

	it('flags files changed or deleted on the branch', () => {
		let list = stageEdit([], 'b.md', 'x\n', { sha: 'old-b', raw: 'o' });
		list = stageEdit(list, 'gone.md', 'y\n', { sha: 'g', raw: 'o' });
		const [changed, deleted] = analyzeChanges(list, remote);
		expect(changed.conflict).toBe('remote-changed');
		expect(deleted.conflict).toBe('remote-deleted');
	});

	it('flags an add that lands on an existing file and overwrites when kept', () => {
		const statuses = analyzeChanges(stageAdd([], 'a.md', 'x\n'), remote);
		expect(statuses[0].conflict).toBe('remote-exists');
		expect(buildFileOps(statuses)).toEqual([{ op: 'update', path: 'a.md', content: 'x\n', sha: 'aaa' }]);
	});

	it('skips deleting a file that is already gone', () => {
		const statuses = analyzeChanges(stageDelete([], 'gone.md', { sha: 'g', raw: '' }), remote);
		expect(statuses[0].conflict).toBeUndefined();
		expect(buildFileOps(statuses)).toEqual([]);
	});

	it('expands a move into delete and create', () => {
		const statuses = analyzeChanges(stageMove([], 'a.md', 'z.md', 'x\n', base), remote);
		expect(buildFileOps(statuses)).toEqual([
			{ op: 'delete', path: 'a.md', sha: 'aaa' },
			{ op: 'create', path: 'z.md', content: 'x\n' }
		]);
	});
});

describe('defaultCommitMessage', () => {
	it('describes one change plainly', () => {
		expect(defaultCommitMessage(stageAdd([], 'dir/pasta.md', 'x\n'))).toBe('Create pasta');
	});

	it('lists several changes', () => {
		let list = stageAdd([], 'a.md', 'x\n');
		list = stageDelete(list, 'b.md', { sha: 'b', raw: '' });
		expect(defaultCommitMessage(list)).toBe('Update 2 files\n\n- Create a\n- Delete b');
	});
});
