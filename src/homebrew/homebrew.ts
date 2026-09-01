import type { DataAdapter } from 'obsidian';

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
};

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


