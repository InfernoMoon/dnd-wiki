import type { Plugin } from 'obsidian';

/** Data persisted in the plugin's data.json file. */
export interface PluginData {
	baseurl?: string;
	baseurls?: Record<string, string>;
	homebrewSearchEntireVault?: boolean;
	homebrewFolderPath?: string;
	homebrewClasses?: string[];
	homebrewMagicSchools?: string[];
	homebrewWeaponTypes?: string[];
	homebrewMagicItemTypes?: string[];
}

let pluginRef: Plugin | undefined;

/** Connect the settings service to the active plugin instance. */
export function configurePluginRef(plugin: Plugin): void {
	pluginRef = plugin;
}

/** Load the plugin's persisted data, returning empty data when unavailable. */
export async function loadPluginData(): Promise<PluginData> {
	try {
	const data: unknown = await pluginRef?.loadData();
		if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
			return data;
		}
	} catch {
		// Return defaults when the plugin data cannot be read.
	}
	return {};
}

/** Save the plugin's persisted data when the service has been configured. */
export async function savePluginData(data: PluginData): Promise<void> {
	if (pluginRef) await pluginRef.saveData(data);
}

/** Read all configured source URLs. */
export async function peekBaseUrls(): Promise<Record<string, string>> {
	const settings = await loadPluginData();
	return settings.baseurls ?? {};
}

/** Write default source URLs on first install without overwriting user data. */
export async function initializeDefaultUrls(): Promise<void> {
	const settings = await loadPluginData();
	if (!settings.baseurls) {
		settings.baseurls = {
			'5e': 'http://dnd5e.wikidot.com',
			'2024': 'http://dnd2024.wikidot.com',
		};
		await savePluginData(settings);
	}
}

/** Save all configured source URLs. */
export async function setBaseUrls(urls: Record<string, string>): Promise<void> {
	const settings = await loadPluginData();
	settings.baseurls = urls;
	await savePluginData(settings);
}
