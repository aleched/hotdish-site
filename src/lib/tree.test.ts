import { describe, expect, it } from 'vitest';
import { buildTree, findFolder, type TreeFolder } from './tree';
import type { RecipeSummary } from '$lib/markdown/recipe';

function summary(path: string, title = path): RecipeSummary {
	return { path, sha: path, title, tags: [], haystack: title.toLowerCase() };
}

describe('buildTree', () => {
	it('mirrors the repository folder structure', () => {
		const tree = buildTree([
			summary('dinner/pasta.md', 'Pasta'),
			summary('dinner/italian/pizza.md', 'Pizza'),
			summary('breakfast.md', 'Breakfast')
		]);

		expect(tree.count).toBe(3);
		const names = tree.children.map((child) => child.name);
		// Folders sort before files.
		expect(names).toEqual(['dinner', 'breakfast.md']);

		const dinner = tree.children[0] as TreeFolder;
		expect(dinner.count).toBe(2);
		expect(dinner.children.map((child) => child.name)).toEqual(['italian', 'pasta.md']);
	});

	it('strips the base path so browsing starts at the recipe root', () => {
		const tree = buildTree([summary('docs/recipes/dinner/pasta.md')], 'docs/recipes');
		expect(tree.children.map((child) => child.name)).toEqual(['dinner']);
		expect(tree.count).toBe(1);
	});

	it('excludes files outside the base path', () => {
		const tree = buildTree(
			[summary('recipes/a.md'), summary('other/b.md')],
			'recipes'
		);
		expect(tree.count).toBe(1);
	});

	it('finds nested folders by path', () => {
		const tree = buildTree([summary('a/b/c.md')]);
		expect(findFolder(tree, 'a/b')?.name).toBe('b');
		expect(findFolder(tree, 'a/missing')).toBeNull();
		expect(findFolder(tree, '')).toBe(tree);
	});
});
