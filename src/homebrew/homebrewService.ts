import { Component, MarkdownRenderer } from 'obsidian';
import type { App, TFile, Vault } from 'obsidian';
import type { CachedRender } from '../cache/renderCache';
import { displayNameFromSlug, nameToSlugs } from '../utils/text';

export const homebrewBackgrounds = new Map<string, string>();
export const homebrewBackgroundPaths = new Map<string, string>();
let app: App | null = null;

/** Connect the homebrew renderer to the active Obsidian app. */
export function configureHomebrewService(appInstance: App): void {
	app = appInstance;
}

/** Return the normalized names currently cached for local backgrounds. */
export function getCachedHomebrewBackgroundIds(): string[] {
	return Array.from(homebrewBackgrounds.keys());
}

/** Cache supported homebrew files. Backgrounds are the first supported type. */
export async function updateHomebrewFileCache(
	vault: Vault,
	filesByType: Record<string, TFile[]>,
): Promise<void> {
	homebrewBackgrounds.clear();
	homebrewBackgroundPaths.clear();
	for (const file of filesByType.background ?? []) {
		const text = await vault.cachedRead(file);
		for (const key of nameToSlugs(file.basename)) {
			homebrewBackgrounds.set(key, text);
			homebrewBackgroundPaths.set(key, file.path);
		}
	}
}

/** Render simple cached homebrew Markdown content from the supplied content maps. */
export async function getSimpleCachedHomebrewContent(
	name: string,
	contentByKey: Map<string, string>,
	pathByKey: Map<string, string>,
): Promise<CachedRender | null> {
	const key = nameToSlugs(name).find(candidate => contentByKey.has(candidate));
	if (!key) {
		return null;
	}

	const text = contentByKey.get(key);
	if (text === undefined || !app) return null;
	const sourcePath = pathByKey.get(key) ?? '';
	const container = document.createElement('div');
	const component = new Component();
	component.load();
	try {
		await MarkdownRenderer.render(app, text, container, sourcePath, component);
		return {
			title: displayNameFromSlug(key),
			html: container.innerHTML,
		};
	}
	finally {
		component.unload();
	}
}
