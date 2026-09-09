import { Component, MarkdownRenderer, TFile } from 'obsidian';
import type { App } from 'obsidian';
import type { CachedRender } from '../cache/renderCache';
import { displayNameFromSlug, nameToSlugs } from '../utils/text';

/** Homebrew IDs mapped to their vault file paths. Content is loaded on demand. */
export const homebrewBackgrounds = new Map<string, string>();
export const homebrewFeats = new Map<string, string>();
export const homebrewLineages = new Map<string, string>();
export const homebrewSpells = new Map<string, string>();
export const homebrewItems = new Map<string, string>();
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

/** Return normalized homebrew magic-item IDs. */
export function getCachedHomebrewItemIds(): string[] {
	return Array.from(homebrewItems.keys());
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
	container.createEl('p', { text: `Source: ${source}` });
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

/** Cache supported homebrew file paths. Content is loaded only when needed. */
export function updateHomebrewFileCache(
	filesByType: Record<string, TFile[]>,
): void {
	homebrewBackgrounds.clear();
	homebrewFeats.clear();
	homebrewLineages.clear();
	homebrewSpells.clear();
	homebrewItems.clear();
	homebrewIdsByType.clear();
	for (const [type, files] of Object.entries(filesByType)) {
		const ids = new Set<string>();
		for (const file of files) for (const key of nameToSlugs(file.basename)) ids.add(key);
		homebrewIdsByType.set(type.toLowerCase(), ids);
	}
	cacheHomebrewFiles(filesByType.background, homebrewBackgrounds);
	cacheHomebrewFiles(filesByType.feat, homebrewFeats);
	cacheHomebrewFiles(filesByType.lineage, homebrewLineages);
	cacheHomebrewFiles(filesByType.spell, homebrewSpells);
	cacheHomebrewFiles(filesByType.item, homebrewItems);
}

function cacheHomebrewFiles(files: TFile[] | undefined, pathByKey: Map<string, string>): void {
	for (const file of files ?? []) {
		for (const key of nameToSlugs(file.basename)) {
			pathByKey.set(key, file.path);
		}
	}
}

/** Render a homebrew spell from its metadata and Markdown body. */
export async function getCachedHomebrewSpellContent(spellName: string): Promise<CachedRender | null> {
	const key = nameToSlugs(spellName).find(candidate => homebrewSpells.has(candidate));
	if (!key || !app) return null;

	const file = getHomebrewFile(homebrewSpells, key);
	if (!file) return null;
	let text: string;
	try {
		text = await app.vault.read(file);
	} catch {
		return null;
	}

	const parsed = parseHomebrewSpell(text);
	const metadata = [
		`*Level ${parsed.level || '—'}${parsed.school ? ` ${parsed.school}` : ''}${parsed.classes.length ? ` (${parsed.classes.join(', ')})` : ''}*`,
		'',
		...formatSpellProperties(parsed),
	].join('\n');
	const markdown = `${metadata}\n\n${parsed.body}`.trim();
	const sourcePath = file.path;
	const container = createDiv();
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
export async function getCachedHomebrewSpellData(spellName: string): Promise<HomebrewSpellData | null> {
	const key = nameToSlugs(spellName).find(candidate => homebrewSpells.has(candidate));
	if (!key) return null;
	const file = getHomebrewFile(homebrewSpells, key);
	if (!file || !app) return null;
	try {
		return parseHomebrewSpell(await app.vault.read(file));
	} catch {
		return null;
	}
}

/** Render a homebrew magic item from its Markdown file. */
export async function getCachedHomebrewItemContent(itemName: string): Promise<CachedRender | null> {
	const key = nameToSlugs(itemName).find(candidate => homebrewItems.has(candidate));
	if (!key || !app) return null;

	const file = getHomebrewFile(homebrewItems, key);
	if (!file) return null;

	let source: string;
	try {
		source = await app.vault.read(file);
	} catch {
		return null;
	}

	const item = parseHomebrewMagicItem(source);
	const description = [item.type, item.level].filter(Boolean).join(', ');
	const attunement = item.requiresAttunement ? '(Requires Attunement)' : '';
	const metadata = [description, attunement].filter(Boolean).join(' ');
	const markdown = [metadata ? `*${metadata}*` : '', item.body].filter(Boolean).join('\n\n');
	const container = createDiv();
	addHomebrewSourceLabel(container);
	const component = new Component();
	component.load();
	try {
		await MarkdownRenderer.render(app, markdown, container, file.path, component);
		return { title: displayNameFromSlug(key), html: container.innerHTML };
	} finally {
		component.unload();
	}
}

export interface HomebrewMagicItemData {
	level: string;
	type: string;
	requiresAttunement: boolean;
	body: string;
}

/** Return parsed metadata for a cached homebrew magic item. */
export async function getCachedHomebrewItemData(itemName: string): Promise<HomebrewMagicItemData | null> {
	const key = nameToSlugs(itemName).find(candidate => homebrewItems.has(candidate));
	if (!key || !app) return null;

	const file = getHomebrewFile(homebrewItems, key);
	if (!file) return null;
	try {
		return parseHomebrewMagicItem(await app.vault.read(file));
	} catch {
		return null;
	}
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

function parseHomebrewMagicItem(source: string): HomebrewMagicItemData {
	const result: HomebrewMagicItemData = {
		level: '',
		type: '',
		requiresAttunement: false,
		body: source,
	};
	const frontmatterMatch = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/u.exec(source);
	if (!frontmatterMatch) return result;

	const values = new Map<string, string>();
	for (const line of frontmatterMatch[1].split(/\r?\n/)) {
		const property = /^([\w-]+):\s*(.*)$/.exec(line.trim());
		if (property) values.set(property[1], property[2].trim());
	}

	result.level = values.get('item-level-dndwiki') ?? '';
	result.type = values.get('item-type-dndwiki') ?? '';
	result.requiresAttunement = (values.get('requires-attunement') ?? '').toLowerCase() === 'true';
	result.body = frontmatterMatch[2].trim();
	return result;
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

/** Render simple homebrew Markdown loaded from the supplied path map. */
export async function getSimpleCachedHomebrewContent(
	name: string,
	pathByKey: Map<string, string>,
): Promise<CachedRender | null> {
	const key = nameToSlugs(name).find(candidate => pathByKey.has(candidate));
	if (!key) {
		return null;
	}

	const file = getHomebrewFile(pathByKey, key);
	if (!file || !app) return null;
	let text: string;
	try {
		text = await app.vault.read(file);
	} catch {
		return null;
	}
	const sourcePath = file.path;
	const container = createDiv();
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

/** Return whether a scanned homebrew entry exists for the supplied name. */
export function hasCachedHomebrewFile(name: string, pathByKey: Map<string, string>): boolean {
	return nameToSlugs(name).some(key => pathByKey.has(key));
}

function getHomebrewFile(pathByKey: Map<string, string>, key: string): TFile | null {
	if (!app) return null;
	const path = pathByKey.get(key);
	const file = path ? app.vault.getAbstractFileByPath(path) : null;
	return file instanceof TFile ? file : null;
}
