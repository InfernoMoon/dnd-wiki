import { Vault } from 'obsidian';
import { DEFAULT_HOMEBREW_FOLDER } from '../dataService';

export const HOMEBREW_CATEGORIES = ['Spells', 'Feats', 'Backgrounds', 'Lineages', 'Magic Items'] as const;

export interface HomebrewFolderResult {
	rootPath: string;
	createdPaths: string[];
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

/** Create missing homebrew template folders without changing existing vault content. */
export async function createHomebrewTemplateFolders(
	vault: Vault,
	folderPath: string,
): Promise<HomebrewFolderResult> {
	const rootPath = normalizeFolderPath(folderPath);
	const createdPaths: string[] = [];

	await ensureFolder(vault, rootPath, createdPaths);
	for (const category of HOMEBREW_CATEGORIES) {
		await ensureFolder(vault, `${rootPath}/${category}`, createdPaths);
	}

	return { rootPath, createdPaths };
}
