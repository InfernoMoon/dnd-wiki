import { IdCache } from '../../cache/idCache';
import { getEquipmentIndex } from '../equipment/equipmentService';
import type { EquipmentIndex, EquipmentIndexEntry } from '../equipment/equipmentService';
import { getPrimarySlug, nameToSlugs } from '../../utils/text';
import type { WeaponTypeDirective } from './weaponListCacheItem';

export const weaponIdCache = new IdCache();

/** Return the preloaded weapon IDs for a source URL. */
export function getKnownWeaponIdsForKey(urlKey: string): string[] {
	return weaponIdCache.get(urlKey);
}

/** Load all weapon names and make them available to the weapon suggester. */
export async function preloadAllWeaponNames(urlKey: string, baseUrl: string): Promise<void> {
	const index = await getWeaponIndex(urlKey, baseUrl, 'all');
	weaponIdCache.addMany(urlKey, index.items.map(item => getPrimarySlug(item.name)).filter(Boolean));
}

/** Return the weapon index through the shared equipment table fetcher. */
export async function getWeaponIndex(
	urlKey: string,
	baseUrl: string,
	typeDirective: WeaponTypeDirective,
): Promise<EquipmentIndex> {
	return getEquipmentIndex(urlKey, baseUrl, ['weapons'], typeDirective);
}

/** Find a weapon entry by any compatible slug generated from its name. */
export function findWeaponEntry(
	index: EquipmentIndex,
	weaponName: string,
): EquipmentIndexEntry | null {
	const requestedSlugs = new Set(nameToSlugs(weaponName));
	return index.items.find(item =>
		nameToSlugs(item.name).some(slug => requestedSlugs.has(slug)),
	) ?? null;
}

export interface WeaponTableGroup {
	headers: string[];
	rows: string[][];
}

/** Group weapon rows by their source table layout so columns stay aligned. */
export function groupWeaponTableRows(entries: EquipmentIndexEntry[]): WeaponTableGroup[] {
	const groups = new Map<string, WeaponTableGroup>();
	for (const entry of entries) {
		if (!entry.table) continue;

		const key = entry.table.headers.map(header => header.toLowerCase()).join('\u001f');
		const existing = groups.get(key);
		if (existing) {
			existing.rows.push(entry.table.values);
			continue;
		}

		groups.set(key, {
			headers: entry.table.headers,
			rows: [entry.table.values],
		});
	}
	return Array.from(groups.values());
}

/** Display name used by empty-result messages. */
export function getWeaponCollectionName(): string {
	return 'Weapons';
}
