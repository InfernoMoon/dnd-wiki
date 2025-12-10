/**
 * dataService.ts
 * Centralized data access for plugin configuration and cached directive values.
 *
 * Responsibilities:
 * - Manage plugin data folder and JSON read/write (settings, classes, schools).
 * - Prompt and persist Base URL used for content fetching.
 * - Preload and expose cached lists for `class:` and `school:` suggesters.
 */

import { App, Notice, Plugin, MarkdownView } from "obsidian";
import { BaseUrlPromptModal } from "./prompts";
declare const app: App;

/** Settings file structure */
interface PluginSettingsJson {
	baseurl?: string;
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

// ------------------------------
// Plugin identity and paths
// ------------------------------

// No filesystem paths needed when using loadData/saveData

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
 * - Reads from settings.json if available
 * - Prompts the user to enter a URL when missing and persists it
 */
export async function getBaseUrl(): Promise<string | null> {
	// 1) Return from memory if available
	if (typeof cachedBaseUrl === "string") {
		return cachedBaseUrl;
	}

	// 2) Read settings via plugin API
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

/** Normalize and sort names from string or object entries */
function extractNames(arr: unknown): string[] {
	if (!Array.isArray(arr)) return [];
	return arr
		.map((x) => {
			if (typeof x === "string") return x;
			if (x && typeof x === "object") {
				const o = x as Record<string, unknown>;
				const name = o["name"] ?? o["title"] ?? o["label"];
				return typeof name === "string" ? name : "";
			}
			return "";
		})
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b));
}

/** Read classes.json from the plugin data folder */
export async function getClassNames(): Promise<string[]> {
	const settings = await readSettings();
	const json = (settings as unknown as { classes?: unknown }).classes ?? [];
	return extractNames(json);
}

/** Read schools.json from the plugin data folder */
export async function getSchoolNames(): Promise<string[]> {
	const settings = await readSettings();
	const json = (settings as unknown as { schools?: unknown }).schools ?? [];
	return extractNames(json);
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
// Public initializer
// ------------------------------

/** Initialize directive caches. Spell IDs are preloaded elsewhere. */
export async function initData(): Promise<void> {
	await preloadDirectiveNames();
}
