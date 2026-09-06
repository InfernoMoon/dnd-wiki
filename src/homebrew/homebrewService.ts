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
export const homebrewSpells = new Map<string, string>();
export const homebrewSpellPaths = new Map<string, string>();
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

export function getCachedHomebrewSpellIds(): string[] {
	return Array.from(homebrewSpells.keys());
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

/** Add the source label displayed above rendered homebrew content. */
export function addHomebrewSourceLabel(container: HTMLElement, source = 'Custom Homebrew'): void {
	const sourceLabel = document.createElement('p');
	sourceLabel.textContent = `Source: ${source}`;
	container.appendChild(sourceLabel);
}

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
	homebrewSpells.clear();
	homebrewSpellPaths.clear();
	homebrewIdsByType.clear();
	for (const [type, files] of Object.entries(filesByType)) {
		const ids = new Set<string>();
		for (const file of files) for (const key of nameToSlugs(file.basename)) ids.add(key);
		homebrewIdsByType.set(type.toLowerCase(), ids);
	}
	await cacheHomebrewFiles(vault, filesByType.background, homebrewBackgrounds, homebrewBackgroundPaths);
	await cacheHomebrewFiles(vault, filesByType.feat, homebrewFeats, homebrewFeatPaths);
	await cacheHomebrewFiles(vault, filesByType.lineage, homebrewLineages, homebrewLineagePaths);
	await cacheHomebrewFiles(vault, filesByType.spell, homebrewSpells, homebrewSpellPaths);
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

/** Render a homebrew spell from its metadata and Markdown body. */
export async function getCachedHomebrewSpellContent(spellName: string): Promise<CachedRender | null> {
	const key = nameToSlugs(spellName).find(candidate => homebrewSpells.has(candidate));
	if (!key || !app) return null;

	const text = homebrewSpells.get(key);
	if (text === undefined) return null;

	const parsed = parseHomebrewSpell(text);
	const metadata = [
		`*Level ${parsed.level || '—'}${parsed.school ? ` ${parsed.school}` : ''}${parsed.classes.length ? ` (${parsed.classes.join(', ')})` : ''}*`,
		'',
		...formatSpellProperties(parsed),
	].join('\n');
	const markdown = `${metadata}\n\n${parsed.body}`.trim();
	const sourcePath = homebrewSpellPaths.get(key) ?? '';
	const container = document.createElement('div');
	addHomebrewSourceLabel(container);
	const component = new Component();
	component.load();
	try {
		await MarkdownRenderer.render(app, markdown, container, sourcePath, component);
		return { title: displayNameFromSlug(key), html: container.innerHTML };
	} finally {
		component.unload();
	}
}

/** Return parsed metadata for a cached homebrew spell. */
export function getCachedHomebrewSpellData(spellName: string): HomebrewSpellData | null {
	const key = nameToSlugs(spellName).find(candidate => homebrewSpells.has(candidate));
	const text = key ? homebrewSpells.get(key) : undefined;
	return text === undefined ? null : parseHomebrewSpell(text);
}

export interface HomebrewSpellData {
	level: string;
	classes: string[];
	school: string;
	range: string;
	castingTime: string;
	components: string;
	duration: string;
	body: string;
}

function parseHomebrewSpell(source: string): HomebrewSpellData {
	const result: HomebrewSpellData = {
		level: '', classes: [], school: '', range: '', castingTime: '', components: '', duration: '', body: source,
	};
	const frontmatterMatch = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/u.exec(source);
	if (!frontmatterMatch) return result;

	const values = new Map<string, string | string[]>();
	let currentKey = '';
	for (const line of frontmatterMatch[1].split(/\r?\n/)) {
		const property = /^([\w-]+):\s*(.*)$/.exec(line.trim());
		if (property) {
			currentKey = property[1];
			values.set(currentKey, property[2]);
			continue;
		}
		const listItem = /^-\s*(.*)$/.exec(line.trim());
		if (listItem && currentKey) {
			const existing = values.get(currentKey);
			const list = Array.isArray(existing) ? existing : [];
			list.push(listItem[1]);
			values.set(currentKey, list);
		}
	}

	result.level = getSpellValue(values, 'spell-level-dndwiki');
	result.classes = getSpellListValue(values, 'class-dndwiki');
	result.school = getSpellValue(values, 'school-dndwiki');
	result.range = getSpellValue(values, 'range-dndwiki');
	result.castingTime = getSpellValue(values, 'casting-time-dndwiki');
	result.components = getSpellValue(values, 'components-dndwiki');
	result.duration = getSpellValue(values, 'duration-dndwiki');
	result.body = frontmatterMatch[2].trim();
	return result;
}

function getSpellValue(values: Map<string, string | string[]>, key: string): string {
	const value = values.get(key);
	return typeof value === 'string' ? value.trim() : '';
}

function getSpellListValue(values: Map<string, string | string[]>, key: string): string[] {
	const value = values.get(key);
	return Array.isArray(value) ? value.map(item => item.trim()).filter(Boolean) : [];
}

function formatSpellProperties(spell: HomebrewSpellData): string[] {
	return [
		['Casting Time', spell.castingTime],
		['Range', spell.range],
		['Components', spell.components],
		['Duration', spell.duration],
	]
		.filter(([, value]) => Boolean(value))
		.map(([label, value]) => `**${label}:** ${value}`);
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
	addHomebrewSourceLabel(container);
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
