import { loadPluginData, savePluginData } from '../settings/settingsService';

export interface HomebrewSettings {
	searchEntireVault: boolean;
	folderPath: string;
}

export const DEFAULT_HOMEBREW_FOLDER = 'Custom Homebrew';

/** Read the homebrew settings used by file and folder creation. */
export async function getHomebrewSettings(): Promise<HomebrewSettings> {
	const data = await loadPluginData();
	const folderPath = data.homebrewFolderPath?.trim();
	return {
		searchEntireVault: data.homebrewSearchEntireVault ?? false,
		folderPath: folderPath ? folderPath.replace(/^\/+|\/+$/g, '') : DEFAULT_HOMEBREW_FOLDER,
	};
}

/** Save the homebrew settings. */
export async function setHomebrewSettings(settings: HomebrewSettings): Promise<void> {
	const data = await loadPluginData();
	data.homebrewSearchEntireVault = settings.searchEntireVault;
	data.homebrewFolderPath = settings.folderPath.trim().replace(/^\/+|\/+$/g, '') || DEFAULT_HOMEBREW_FOLDER;
	await savePluginData(data);
}
