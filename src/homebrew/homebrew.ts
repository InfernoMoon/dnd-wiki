import { normalizePath, TFolder } from 'obsidian';
import type { DataAdapter, Vault } from 'obsidian';
import { DEFAULT_HOMEBREW_FOLDER } from './homebrewSettings';
import type { HomebrewSettings } from './homebrewSettings';

const TYPES_PATH = '.obsidian/types.json';

const HOMEBREW_PROPERTY_TYPES: Record<string, string> = {
	'spell-level-dndwiki': 'number',
	'class-dndwiki': 'multitext',
	'school-dndwiki': 'text',
	'range-dndwiki': 'text',
	'casting-time-dndwiki': 'text',
	'components-dndwiki': 'text',
	'duration-dndwiki': 'text',
	'item-level-dndwiki': 'text',
	'item-type-dndwiki': 'text',
	'requires-attunement': 'checkbox',
	'weapon-type-dndwiki': 'text',
	'weapon-damage-dndwiki': 'text',
	'weapon-properties-dndwiki': 'multitext',
	'weapon-mastery-dndwiki': 'text',
	'weight-dndwiki': 'text',
	'cost-dndwiki': 'text',
};

export async function ensureHomebrewFolderPath(vault: Vault, settings: HomebrewSettings): Promise<string> {
	const configuredPath = settings.folderPath.trim();
	const configuredSegments = configuredPath.split(/[\\/]+/).filter(Boolean);
	const isSafeRelativePath = Boolean(configuredPath)
		&& !configuredPath.startsWith('/')
		&& !configuredPath.startsWith('\\')
		&& !/^[A-Za-z]:[\\/]/.test(configuredPath)
		&& !configuredSegments.some((segment) => segment === '.' || segment === '..');
	const normalizedConfiguredPath = isSafeRelativePath
		? normalizePath(configuredPath).replace(/^\/+|\/+$/g, '')
		: '';
	const candidatePaths = normalizedConfiguredPath && normalizedConfiguredPath !== DEFAULT_HOMEBREW_FOLDER
		? [normalizedConfiguredPath, DEFAULT_HOMEBREW_FOLDER]
		: [DEFAULT_HOMEBREW_FOLDER];

	for (const rootPath of candidatePaths) {
		try {
			const rootSegments = rootPath.split('/').filter(Boolean);
			let currentPath = '';

			for (const segment of rootSegments) {
				currentPath = currentPath ? `${currentPath}/${segment}` : segment;
				const existing = vault.getAbstractFileByPath(currentPath);
				if (existing && !(existing instanceof TFolder)) {
					throw new Error(`The path component is not a folder: ${currentPath}`);
				}
				if (!existing) await vault.createFolder(currentPath);
			}

			return rootPath;
		} catch (error: unknown) {
			if (rootPath === DEFAULT_HOMEBREW_FOLDER) throw error;
			console.warn(
				`DnD Wiki: Could not use homebrew folder path "${rootPath}". Falling back to "${DEFAULT_HOMEBREW_FOLDER}".`,
				error,
			);
		}
	}

	throw new Error(`Could not create the homebrew folder: ${DEFAULT_HOMEBREW_FOLDER}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Ensure the plugin-owned homebrew property types are present and correct. */
export async function ensureHomebrewPropertyTypes(adapter: DataAdapter): Promise<void> {
	let config: Record<string, unknown> = {};

	if (await adapter.exists(TYPES_PATH)) {
		const raw = await adapter.read(TYPES_PATH);
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw) as unknown;
		} catch (error: unknown) {
			console.warn('DnD Wiki: Could not parse .obsidian/types.json', error);
			return;
		}
		if (!isRecord(parsed)) {
			console.warn('DnD Wiki: Ignoring invalid .obsidian/types.json contents');
			return;
		}
		config = parsed;
	}

	const currentTypes = isRecord(config.types) ? config.types : {};
	const updatedTypes: Record<string, unknown> = { ...currentTypes };
	let changed = !isRecord(config.types);

	for (const [property, type] of Object.entries(HOMEBREW_PROPERTY_TYPES)) {
		if (updatedTypes[property] !== type) {
			updatedTypes[property] = type;
			changed = true;
		}
	}

	if (!changed) return;

	config.types = updatedTypes;
	await adapter.write(TYPES_PATH, `${JSON.stringify(config, null, 2)}\n`);
}
