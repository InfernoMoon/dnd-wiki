import { loadPluginData, savePluginData } from '../settings/settingsService';
import { setHomebrewSuggestionValues } from '../data/staticData';

export interface HomebrewSettings {
	searchEntireVault: boolean;
	folderPath: string;
	classes: string[];
	magicSchools: string[];
	weaponTypes: string[];
	magicItemTypes: string[];
}

export const DEFAULT_HOMEBREW_FOLDER = 'Custom Homebrew';

/** Read the homebrew settings used by file and folder creation. */
export async function getHomebrewSettings(): Promise<HomebrewSettings> {
	const data = await loadPluginData();
	const folderPath = data.homebrewFolderPath?.trim();
	return {
		searchEntireVault: data.homebrewSearchEntireVault ?? false,
		folderPath: folderPath ? folderPath.replace(/^\/+|\/+$/g, '') : DEFAULT_HOMEBREW_FOLDER,
		classes: normalizeSuggestionValues(data.homebrewClasses),
		magicSchools: normalizeSuggestionValues(data.homebrewMagicSchools),
		weaponTypes: normalizeSuggestionValues(data.homebrewWeaponTypes),
		magicItemTypes: normalizeSuggestionValues(data.homebrewMagicItemTypes),
	};
}

/** Save the homebrew settings. */
export async function setHomebrewSettings(settings: HomebrewSettings): Promise<void> {
	const data = await loadPluginData();
	data.homebrewSearchEntireVault = settings.searchEntireVault;
	data.homebrewFolderPath = settings.folderPath.trim().replace(/^\/+|\/+$/g, '') || DEFAULT_HOMEBREW_FOLDER;
	data.homebrewClasses = settings.classes;
	data.homebrewMagicSchools = settings.magicSchools;
	data.homebrewWeaponTypes = settings.weaponTypes;
	data.homebrewMagicItemTypes = settings.magicItemTypes;
	await savePluginData(data);
	setHomebrewSuggestionValues(settings);
}

/** Make saved homebrew values available to static-data-backed suggesters. */
export function applyHomebrewSuggestionValues(settings: HomebrewSettings): void {
	setHomebrewSuggestionValues(settings);
}

function normalizeSuggestionValues(values: unknown): string[] {
	if (!Array.isArray(values)) return [];
	return Array.from(new Map(values
		.filter((value): value is string => typeof value === 'string')
		.map(value => value.trim())
		.filter(Boolean)
		.map(value => [value.toLowerCase(), value] as const)).values());
}
