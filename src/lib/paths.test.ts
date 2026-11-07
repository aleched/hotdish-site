import { describe, expect, it } from 'vitest';
import {
	baseName,
	commitMessages,
	encodeDocPath,
	fileNameError,
	folderError,
	joinPath,
	normalizeFolder,
	parentFolder,
	slugify,
	toFull,
	toRelative,
	withMarkdownExtension
} from './paths';

describe('slugify', () => {
	it('lowercases and dashes non-alphanumerics', () => {
		expect(slugify('  Tater Tot Hotdish! ')).toBe('tater-tot-hotdish');
	});

	it('drops apostrophes instead of splitting the word', () => {
		expect(slugify("General Tsao's Chicken")).toBe('general-tsaos-chicken');
		expect(slugify('S’mores Cookie Bars')).toBe('smores-cookie-bars');
	});

	it('spells out ampersands', () => {
		expect(slugify('Sweet Cream Base - Ben & Jerry')).toBe('sweet-cream-base-ben-and-jerry');
		expect(slugify('Mac&Cheese')).toBe('mac-and-cheese');
	});
});

describe('withMarkdownExtension', () => {
	it('adds .md only when missing', () => {
		expect(withMarkdownExtension('pasta')).toBe('pasta.md');
		expect(withMarkdownExtension('pasta.md')).toBe('pasta.md');
		expect(withMarkdownExtension('pasta.Markdown')).toBe('pasta.Markdown');
		expect(withMarkdownExtension('')).toBe('');
	});
});

describe('normalizeFolder', () => {
	it('collapses slashes and trims segments', () => {
		expect(normalizeFolder(' /dinner// italian \\ quick/ ')).toBe('dinner/italian/quick');
		expect(normalizeFolder('/')).toBe('');
	});
});

describe('folderError', () => {
	it('rejects dot segments and hidden folders', () => {
		expect(folderError('dinner/../x')).not.toBeNull();
		expect(folderError('.github')).not.toBeNull();
		expect(folderError('dinner/italian')).toBeNull();
		expect(folderError('')).toBeNull();
	});
});

describe('fileNameError', () => {
	it('requires a plain name', () => {
		expect(fileNameError('')).not.toBeNull();
		expect(fileNameError('a/b.md')).not.toBeNull();
		expect(fileNameError('.hidden.md')).not.toBeNull();
		expect(fileNameError('pasta.md')).toBeNull();
	});
});

describe('path parts', () => {
	it('encodes document paths segment by segment', () => {
		expect(encodeDocPath('dinner/mac & cheese #2?.md')).toBe('dinner/mac%20%26%20cheese%20%232%3F.md');
		expect(encodeDocPath('')).toBe('');
	});

	it('joins, splits and rebases paths', () => {
		expect(joinPath('recipes/', '', '/dinner', 'pasta.md')).toBe('recipes/dinner/pasta.md');
		expect(parentFolder('dinner/pasta.md')).toBe('dinner');
		expect(parentFolder('pasta.md')).toBe('');
		expect(baseName('dinner/pasta.md')).toBe('pasta.md');
		expect(toRelative('recipes/dinner/pasta.md', 'recipes')).toBe('dinner/pasta.md');
		expect(toRelative('dinner/pasta.md', '')).toBe('dinner/pasta.md');
		expect(toFull('dinner/pasta.md', 'recipes/')).toBe('recipes/dinner/pasta.md');
	});
});

describe('commitMessages', () => {
	it('prefills with the document title', () => {
		expect(commitMessages.create('Pasta')).toBe('Create Pasta');
		expect(commitMessages.update('Pasta')).toBe('Update Pasta');
		expect(commitMessages.delete('Pasta')).toBe('Delete Pasta');
	});

	it('describes moves and renames', () => {
		expect(commitMessages.move('Pasta', 'pasta.md', 'dinner/pasta.md')).toBe('Move Pasta to dinner');
		expect(commitMessages.move('Pasta', 'dinner/pasta.md', 'pasta.md')).toBe(
			'Move Pasta to top level'
		);
		expect(commitMessages.move('Pasta', 'dinner/pasta.md', 'dinner/spaghetti.md')).toBe(
			'Rename Pasta to spaghetti.md'
		);
	});
});
