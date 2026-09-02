import { Plugin } from "obsidian";
import { STATIC_CLASSES, STATIC_SCHOOLS, STATIC_ITEM_RARITY_WORD_TO_INDEX } from "./data/staticData";
import { getCustomSpellEntries } from "./spells/spellUtils";
import { displayNameFromSlug, nameToSlug } from "./utils/text";

/** Settings file structure */
interface PluginSettingsJson {
	baseurl?: string;
	baseurls?: Record<string, string>;
	homebrewSearchEntireVault?: boolean;
	homebrewFolderPath?: string;
}

export interface HomebrewSettings {
	searchEntireVault: boolean;
	folderPath: string;
}

export const DEFAULT_HOMEBREW_FOLDER = 'Custom Homebrew';

// Use Obsidian's official plugin data APIs via plugin.loadData/saveData
let pluginRef: Plugin | undefined;
export function configurePluginRef(plugin: Plugin) {
	pluginRef = plugin;
}

async function readSettings(): Promise<PluginSettingsJson> {
	try {
		const data = (await pluginRef?.loadData()) as PluginSettingsJson | undefined;
		return data ?? {};
	} catch {
		return {};
	}
}

async function writeSettings(data: PluginSettingsJson): Promise<void> {
	await pluginRef?.saveData(data);
}

// ---- Multiple Base URLs support ----

/**
 * Peek at stored base URLs without prompting.
 * @returns Object with keys mapping to base URLs
 */
export async function peekBaseUrls(): Promise<Record<string, string>> {
	const settings = await readSettings();
	return settings.baseurls ?? {};
}

/**
 * Write default base URLs to disk on first install.
 * Only runs if no baseurls have ever been saved. Never overwrites user data.
 */
export async function initializeDefaultUrls(): Promise<void> {
	const settings = await readSettings();
	if (!settings.baseurls) {
		settings.baseurls = { '5e': 'http://dnd5e.wikidot.com', '2024': 'http://dnd2024.wikidot.com' };
		await writeSettings(settings);
	}
}

/**
 * Save multiple base URLs.
 * @param urls Object with keys mapping to base URLs
 */
export async function setBaseUrls(urls: Record<string, string>): Promise<void> {
	const current = await readSettings();
	current.baseurls = urls;
	await writeSettings(current);
}

export async function getHomebrewSettings(): Promise<HomebrewSettings> {
	const settings = await readSettings();
	const folderPath = settings.homebrewFolderPath?.trim();
	return {
		searchEntireVault: settings.homebrewSearchEntireVault ?? false,
		folderPath: folderPath ? folderPath.replace(/^\/+|\/+$/g, '') : DEFAULT_HOMEBREW_FOLDER,
	};
}

export async function setHomebrewSettings(settings: HomebrewSettings): Promise<void> {
	const current = await readSettings();
	current.homebrewSearchEntireVault = settings.searchEntireVault;
	current.homebrewFolderPath = settings.folderPath.trim().replace(/^\/+|\/+$/g, '') || DEFAULT_HOMEBREW_FOLDER;
	await writeSettings(current);
}

/**
 * Get the first non-empty base URL from stored URLs.
 * Fallback for when code doesn't specify which URL to use.
 * @returns First non-empty URL, or null if none available
 */
export async function getFirstBaseUrl(): Promise<string | null> {
	const urls = await peekBaseUrls();
	for (const url of Object.values(urls)) {
		if (url && url.trim()) {
			return url.trim();
		}
	}
	return null;
}

/** Keep Base URL cache in sync with changes to settings.json */
export function initBaseUrlWatcher(plugin: Plugin) {
	// With loadData/saveData, we don't need file watchers. Keep a weak ref.
	configurePluginRef(plugin);
}

// ------------------------------
// Directive values (classes, schools)
// ------------------------------

/** Read classes.json from the plugin data folder */
export async function getClassNames(): Promise<string[]> {
	// Merge static classes with any classes referenced by custom spells
	const base = STATIC_CLASSES.slice();
	let customs: string[] = [];
	try {
		const entries = await getCustomSpellEntries();
		const set = new Set<string>();
		for (const e of entries) {
			for (const c of e.classes || []) set.add(c);
		}
		customs = Array.from(set).map((s) => displayNameFromSlug(s));
	} catch {
		customs = [];
	}
	// Dedupe by slug, prefer nicely-cased display names
	const bySlug = new Map<string, string>();
	for (const n of base) bySlug.set(nameToSlug(n), n);
	for (const n of customs) bySlug.set(nameToSlug(n), n);
	return Array.from(bySlug.values()).sort((a, b) => a.localeCompare(b));
}

/** Read schools.json from the plugin data folder */
export async function getSchoolNames(): Promise<string[]> {
	// Merge static schools with any school referenced by custom spells
	const base = STATIC_SCHOOLS.slice();
	let customs: string[] = [];
	try {
		const entries = await getCustomSpellEntries();
		const set = new Set<string>();
		for (const e of entries) {
			if (e.school) set.add(e.school);
		}
		customs = Array.from(set).map((s) => displayNameFromSlug(s));
	} catch {
		customs = [];
	}
	const bySlug = new Map<string, string>();
	for (const n of base) bySlug.set(nameToSlug(n), n);
	for (const n of customs) bySlug.set(nameToSlug(n), n);
	return Array.from(bySlug.values()).sort((a, b) => a.localeCompare(b));
}

// In-memory caches used by suggesters for synchronous access
let cachedClassNames: string[] = [];
let cachedSchoolNames: string[] = [];

/** Preload and cache directive names (classes, schools) */
export async function preloadDirectiveNames(): Promise<void> {
	try {
		cachedClassNames = await getClassNames();
	} catch {
		cachedClassNames = [];
	}
	try {
		cachedSchoolNames = await getSchoolNames();
	} catch {
		cachedSchoolNames = [];
	}
}

/** Get cached class names (may be empty until initData runs) */
export function getCachedClassNames(): string[] {
	return cachedClassNames.length ? cachedClassNames : STATIC_CLASSES;
}

/** Get cached school names (may be empty until initData runs) */
export function getCachedSchoolNames(): string[] {
	return cachedSchoolNames.length ? cachedSchoolNames : STATIC_SCHOOLS;
}

// ------------------------------
// Item rarity (Wondrous Items)
// ------------------------------

/**
 * Get display-friendly item rarity names in canonical order.
 * Returns hyphenated Title Case (e.g., "Very-Rare").
 */
export function getItemRarityNames(): string[] {
	const entries = Object.entries(STATIC_ITEM_RARITY_WORD_TO_INDEX);
	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	entries.sort((a, b) => a[1] - b[1]);
	return entries.map(([key]) => key.split('-').map(cap).join('-'));
}

/**
 * Expose the static rarity word→index mapping for consumers that need indices.
 */
export function getItemRarityWordToIndex(): Record<string, number> {
	return { ...STATIC_ITEM_RARITY_WORD_TO_INDEX };
}

// ------------------------------
// Public initializer
// ------------------------------

/** Initialize directive caches. Spell IDs are preloaded elsewhere. */
export async function initData(): Promise<void> {
	await preloadDirectiveNames();
}
