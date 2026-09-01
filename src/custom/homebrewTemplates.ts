import { Vault } from 'obsidian';
import { DEFAULT_HOMEBREW_FOLDER } from '../dataService';

export const HOMEBREW_CATEGORIES = ['Spells', 'Feats', 'Backgrounds', 'Lineages', 'Magic Items'] as const;

export interface HomebrewFolderResult {
	rootPath: string;
	createdPaths: string[];
	createdFiles: string[];
}

function normalizeFolderPath(folderPath: string): string {
	return folderPath.trim().replace(/^\/+|\/+$/g, '') || DEFAULT_HOMEBREW_FOLDER;
}

async function ensureFolder(vault: Vault, folderPath: string, createdPaths: string[]): Promise<void> {
	const segments = folderPath.split('/').filter(Boolean);
	let currentPath = '';

	for (const segment of segments) {
		currentPath = currentPath ? `${currentPath}/${segment}` : segment;
		if (vault.getAbstractFileByPath(currentPath)) continue;
		await vault.createFolder(currentPath);
		createdPaths.push(currentPath);
	}
}

async function createHomebrewFolderStructure(
	vault: Vault,
	rootPath: string,
	createdPaths: string[],
): Promise<void> {
	await ensureFolder(vault, rootPath, createdPaths);
	for (const category of HOMEBREW_CATEGORIES) {
		await ensureFolder(vault, `${rootPath}/${category}`, createdPaths);
	}
}

async function createHomebrewTemplateFiles(
	vault: Vault,
	rootPath: string,
	createdFiles: string[],
): Promise<void> {
	const snowballPath = `${rootPath}/Spells/_Snowball.md`;
	if (vault.getAbstractFileByPath(snowballPath)) return;

	const snowballContent = `---
tags:
  - dndwiki/spell
spell-level-dndwiki: 3
class-dndwiki:
  - Sorcerer
  - Wizard
school-dndwiki: Evocation
range-dndwiki: 150 feet
casting-time-dndwiki: Action
components-dndwiki: V, S, M (a small amount of snow)
duration-dndwiki: Instantaneous
---
You form a snowball in your hand and throw it at a point you choose within range. The snowball travels with **remarkable speed** and, upon reaching the chosen point, **explodes into a tiny amount of snow**.

Each creature in a 5-foot-radius Sphere centered on that point makes a Dexterity saving throw, taking **1d4 Cold damage** on a failed save or half as much damage on a successful one.

Flammable objects in the area that aren’t being worn or carried become **covered in a light dusting of snow**.

**Using a Higher-Level Spell Slot.** The snowball increases in size by **1d4 inches** for each spell slot level above 3.
`;
	await vault.create(snowballPath, snowballContent);
	createdFiles.push(snowballPath);
}

/** Create missing homebrew template folders without changing existing vault content. */
export async function createHomebrewTemplateFolders(
	vault: Vault,
	folderPath: string,
): Promise<HomebrewFolderResult> {
	const rootPath = normalizeFolderPath(folderPath);
	const createdPaths: string[] = [];
	const createdFiles: string[] = [];

	await createHomebrewFolderStructure(vault, rootPath, createdPaths);
	await createHomebrewTemplateFiles(vault, rootPath, createdFiles);

	return { rootPath, createdPaths, createdFiles };
}
