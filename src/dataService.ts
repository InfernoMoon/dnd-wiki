import { App, Notice, Plugin, MarkdownView } from "obsidian";
import { STATIC_CLASSES, STATIC_SCHOOLS, STATIC_ITEM_RARITY_WORD_TO_INDEX } from "./data/staticData";
import { getCustomSpellEntries } from "./spellUtils";
import { displayNameFromSlug, nameToSlug } from "./utils";
import { BaseUrlPromptModal } from "./prompts";
declare const app: App;

/** Settings file structure */
interface PluginSettingsJson {
	baseurl?: string;
	baseurls?: Record<string, string>;
}

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
 * @returns Object with keys mapping to base URLs (e.g., { "5e": "https://...", "2024": "https://..." })
 */
export async function peekBaseUrls(): Promise<Record<string, string>> {
	const settings = await readSettings();
	return settings.baseurls ?? { '5e': '', '2024': '' };
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

// ------------------------------
// Base URL management
// ------------------------------

let cachedBaseUrl: string | undefined;
// Singleton in-flight prompt task to avoid multiple modals
let baseUrlTask: Promise<string | null> | undefined;

/** Keep Base URL cache in sync with changes to settings.json */
export function initBaseUrlWatcher(plugin: Plugin) {
	// With loadData/saveData, we don't need file watchers. Keep a weak ref.
	configurePluginRef(plugin);
}

/**
 * Resolve the Base URL used for fetching content.
 * - Returns cached value if present
 * - Reads from new baseurls if available
 * - Falls back to old baseurl for backward compatibility
 * - Prompts the user to enter a URL when missing and persists it
 */
export async function getBaseUrl(): Promise<string | null> {
	// 1) Return from memory if available
	if (typeof cachedBaseUrl === "string") {
		return cachedBaseUrl;
	}

	// 2) Try new baseurls system first
	const urls = await peekBaseUrls();
	const firstUrl = Object.values(urls).find(u => u && u.trim());
	if (firstUrl) {
		cachedBaseUrl = firstUrl.trim();
		return cachedBaseUrl;
	}

	// 3) Fall back to old baseurl for backward compatibility
	const current = await readSettings();
	if (current.baseurl) {
		cachedBaseUrl = current.baseurl;
		return cachedBaseUrl;
	}

	// 3) If a prompt task is already in-flight, await it; else start one
	if (!baseUrlTask) {
		const task = (baseUrlTask ??= new Promise<string | null>((resolve) => {
			new BaseUrlPromptModal(app, async (value: string) => {
				if (!value) {
					const n = new Notice(
						"DnD 5e Cards: No URL provided; plugin may not work."
					);
					(
						globalThis as unknown as { __dnd5eCardsNotices?: unknown[] }
					).__dnd5eCardsNotices =
						(
							globalThis as unknown as {
								__dnd5eCardsNotices?: unknown[];
							}
						).__dnd5eCardsNotices || [];
					(
						globalThis as unknown as { __dnd5eCardsNotices: unknown[] }
					).__dnd5eCardsNotices.push(n);
					resolve(null);
					return;
				}
				const updated: PluginSettingsJson = { ...current, baseurl: value };
				await writeSettings(updated);
				const n2 = new Notice("DnD 5e Cards: Base URL saved.");
				(
					globalThis as unknown as { __dnd5eCardsNotices?: unknown[] }
				).__dnd5eCardsNotices =
					(globalThis as unknown as { __dnd5eCardsNotices?: unknown[] })
						.__dnd5eCardsNotices || [];
				(
					globalThis as unknown as { __dnd5eCardsNotices: unknown[] }
				).__dnd5eCardsNotices.push(n2);
				cachedBaseUrl = value;
				// Best-effort: refresh the active Markdown view after a short delay
				setTimeout(() => {
					const view = app.workspace.getActiveViewOfType(MarkdownView);
					const leaf = app.workspace.getLeaf(true);
					if (leaf && view) {
						const state = leaf.getViewState();
						leaf.setViewState(state);
						app.workspace.trigger('active-leaf-change');
					} else {
						// Fallback: reopen the active file
						const file = app.workspace.getActiveFile();
						if (file) {
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(app.workspace as any).openLinkText?.(file.path, '', true);
						}
					}
				}, 1000);
				resolve(cachedBaseUrl);
			}).open();
		}));
		task.finally(() => {
			// Clear the task so subsequent calls can re-prompt if needed
			baseUrlTask = undefined;
		});
	}

	const result = await baseUrlTask;
	// 4) Return from memory if set by the task
	if (typeof cachedBaseUrl === "string") {
		return cachedBaseUrl;
	}
	// 5) If still missing, warn and return empty string-equivalent
	if (!result) {
		const warn = new Notice("DnD 5e Cards: Base URL not set; please configure it.");
		(
			globalThis as unknown as { __dnd5eCardsNotices?: unknown[] }
		).__dnd5eCardsNotices =
			(globalThis as unknown as { __dnd5eCardsNotices?: unknown[] })
				.__dnd5eCardsNotices || [];
		(
			globalThis as unknown as { __dnd5eCardsNotices: unknown[] }
		).__dnd5eCardsNotices.push(warn);
		return "";
	}
	return result;
}

/** Update and persist the Base URL, updating cache and settings.json */
export async function setBaseUrl(value: string | undefined): Promise<void> {
		const current = await readSettings();
		const updated: PluginSettingsJson = { ...current, baseurl: value || undefined };
		await writeSettings(updated);
		cachedBaseUrl = value || undefined;
}

/** Peek the Base URL without prompting the user. */
export async function peekBaseUrl(): Promise<string | undefined> {
	if (typeof cachedBaseUrl === 'string') return cachedBaseUrl;
	const current = await readSettings();
	return current.baseurl || undefined;
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
	return cachedClassNames;
}

/** Get cached school names (may be empty until initData runs) */
export function getCachedSchoolNames(): string[] {
	return cachedSchoolNames;
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
