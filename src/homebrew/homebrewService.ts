import { Component, MarkdownRenderer } from 'obsidian';
import type { App, TFile, Vault } from 'obsidian';
import type { CachedRender } from '../cache/renderCache';
import { displayNameFromSlug, nameToSlugs } from '../utils/text';

export const homebrewBackgrounds = new Map<string, string>();
export const homebrewBackgroundPaths = new Map<string, string>();
export const homebrewFeats = new Map<string, string>();
export const homebrewFeatPaths = new Map<string, string>();
export const homebrewLineages = new Map<string, string>();
export const homebrewLineagePaths = new Map<string, string>();
let app: App | null = null;

/** Connect the homebrew renderer to the active Obsidian app. */
export function configureHomebrewService(appInstance: App): void {
	app = appInstance;
}

/** Return the normalized names currently cached for local backgrounds. */
export function getCachedHomebrewBackgroundIds(): string[] {
	return Array.from(homebrewBackgrounds.keys());
}

export function getCachedHomebrewFeatIds(): string[] {
	return Array.from(homebrewFeats.keys());
}

export function getCachedHomebrewLineageIds(): string[] {
	return Array.from(homebrewLineages.keys());
}

/** Cache supported homebrew files. Backgrounds are the first supported type. */
export async function updateHomebrewFileCache(
	vault: Vault,
	filesByType: Record<string, TFile[]>,
): Promise<void> {
	homebrewBackgrounds.clear();
	homebrewBackgroundPaths.clear();
	homebrewFeats.clear();
	homebrewFeatPaths.clear();
	homebrewLineages.clear();
	homebrewLineagePaths.clear();
	await cacheHomebrewFiles(vault, filesByType.background, homebrewBackgrounds, homebrewBackgroundPaths);
	await cacheHomebrewFiles(vault, filesByType.feat, homebrewFeats, homebrewFeatPaths);
	await cacheHomebrewFiles(vault, filesByType.lineage, homebrewLineages, homebrewLineagePaths);
}

async function cacheHomebrewFiles(
	vault: Vault,
	files: TFile[] | undefined,
	contentByKey: Map<string, string>,
	pathByKey: Map<string, string>,
): Promise<void> {
	for (const file of files ?? []) {
		const text = await vault.cachedRead(file);
		for (const key of nameToSlugs(file.basename)) {
			contentByKey.set(key, text);
			pathByKey.set(key, file.path);
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
	const sourceLabel = document.createElement('p');
	sourceLabel.textContent = 'Source: Custom Homebrew';
	container.appendChild(sourceLabel);
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
