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
const homebrewIdsByType = new Map<string, Set<string>>();
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

/** Return normalized homebrew IDs for any scanned tag type. */
export function getCachedHomebrewIds(type: string): string[] {
	return Array.from(homebrewIdsByType.get(type.toLowerCase()) ?? []);
}

/** Return whether a name is present in the scanned homebrew type. */
export function isHomebrewContent(type: string, name: string): boolean {
	const normalizedType = type.toLowerCase();
	const types = normalizedType === 'magicitem'
		? ['item']
		: normalizedType === 'equipment'
			? ['item', 'weapon', 'armor']
			: [normalizedType];
	return nameToSlugs(name).some(slug => types.some(candidateType =>
		homebrewIdsByType.get(candidateType)?.has(slug) ?? false,
	));
}

export type HomebrewMode = 'include' | 'exclude' | 'only';

/** Parse the reusable homebrew list directive. */
export function parseHomebrewMode(values: string[]): HomebrewMode {
	const value = values[0]?.trim().toLowerCase();
	return value === 'exclude' || value === 'only' ? value : 'include';
}

/** Filter names according to the reusable homebrew list directive. */
export function filterHomebrewNames(names: string[], type: string, mode: HomebrewMode): string[] {
	if (mode === 'include') return names;
	return names.filter(name => isHomebrewContent(type, name) === (mode === 'only'));
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
	homebrewIdsByType.clear();
	for (const [type, files] of Object.entries(filesByType)) {
		const ids = new Set<string>();
		for (const file of files) for (const key of nameToSlugs(file.basename)) ids.add(key);
		homebrewIdsByType.set(type.toLowerCase(), ids);
	}
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
