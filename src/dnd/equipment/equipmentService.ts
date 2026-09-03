import { RenderCache } from '../../cache/renderCache';
import type { CachedRender } from '../../cache/renderCache';
import { STATIC_WEAPON_TYPES } from '../../data/staticData';
import { nameToSlugs } from '../../utils/text';
import type { EquipmentTypeDirective, WeaponTypeDirective } from './equipmentListCacheItem';
import { fetchEquipmentIndex as fetchEquipmentIndexFromSource } from './equipmentFetcher';

export interface EquipmentIndexEntry {
	name: string;
	type: string;
	weaponType?: string;
	table?: EquipmentTableRow;
	render?: CachedRender;
}

export interface EquipmentTableRow {
	headers: string[];
	values: string[];
}

export interface EquipmentIndex {
	items: EquipmentIndexEntry[];
}

export interface EquipmentFetchSettings {
	includeArmorAndShields: boolean;
	includeWeapons: boolean;
	weaponTypes: string[];
}

const equipmentIndexCache = new Map<string, EquipmentIndex>();
const equipmentRenderCache = new RenderCache<CachedRender>();

export function getEquipmentCollectionName(): string {
	return 'Equipment';
}

/** Determine which equipment categories a list request needs to fetch. */
export function getEquipmentFetchSettings(
	typeDirective: EquipmentTypeDirective,
	weaponTypeDirective: WeaponTypeDirective,
): EquipmentFetchSettings {
	const types = typeDirective === 'all' || !Array.isArray(typeDirective) || !typeDirective.length
		? new Set(['armor-and-shields', 'weapons'])
		: new Set(typeDirective.map(normalizeEquipmentType));
	const includeWeapons = types.has('weapons');
	return {
		includeArmorAndShields: types.has('armor-and-shields'),
		includeWeapons,
		weaponTypes: includeWeapons ? getWeaponTypesToFetch(weaponTypeDirective) : [],
	};
}

function getWeaponTypesToFetch(weaponTypeDirective: WeaponTypeDirective): string[] {
	if (weaponTypeDirective === 'all' || !Array.isArray(weaponTypeDirective) || !weaponTypeDirective.length) {
		return Array.from(STATIC_WEAPON_TYPES.keys()).map(normalizeWeaponType);
	}
	return Array.from(new Set(weaponTypeDirective.map(normalizeWeaponType).filter(Boolean)));
}

/** Return the equipment index for a source and the requested categories. */
export async function getEquipmentIndex(
	urlKey: string,
	baseUrl: string,
	typeDirective: EquipmentTypeDirective,
	weaponTypeDirective: WeaponTypeDirective,
): Promise<EquipmentIndex> {
	const fetchSettings = getEquipmentFetchSettings(typeDirective, weaponTypeDirective);
	const cacheKey = [
		urlKey,
		`armor:${fetchSettings.includeArmorAndShields}`,
		`weapons:${fetchSettings.includeWeapons}`,
		`weaponTypes:${fetchSettings.weaponTypes.join(',')}`,
	].join('|');
	const existing = equipmentIndexCache.get(cacheKey);
	if (existing) return existing;

	const index = await fetchEquipmentIndexFromSource(baseUrl, fetchSettings);
	equipmentIndexCache.set(cacheKey, index);
	for (const item of index.items) {
		if (!item.render) continue;
		for (const itemId of nameToSlugs(item.name)) {
			equipmentRenderCache.set(urlKey, itemId, item.render);
		}
	}
	return index;
}

function normalizeEquipmentType(type: string): string {
	const normalized = type.trim().toLowerCase().replace(/\s+/g, '-');
	if (normalized === 'armor' || normalized === 'armor-and-shield' || normalized === 'armor-and-shields') {
		return 'armor-and-shields';
	}
	if (normalized === 'weapon' || normalized === 'weapons') return 'weapons';
	return normalized;
}

function normalizeWeaponType(type: string): string {
	return type.trim().toLowerCase().replace(/\s+/g, '-');
}

export async function ensureEquipmentCached(
	equipmentName: string,
	urlKey: string,
	baseUrl: string,
): Promise<CachedRender | null> {
	const equipmentIds = nameToSlugs(equipmentName);
	for (const equipmentId of equipmentIds) {
		const existing = equipmentRenderCache.get(urlKey, equipmentId);
		if (existing) return existing;
	}

	const index = await getEquipmentIndex(urlKey, baseUrl, 'all', 'all');
	const requestedIds = new Set(equipmentIds);
	const match = index.items.find(item => requestedIds.has(nameToSlugs(item.name)[0] ?? ''));
	return match?.render ?? null;
}
