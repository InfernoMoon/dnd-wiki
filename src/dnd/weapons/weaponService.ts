import { IdCache } from '../../cache/idCache';
import { displayNameFromSlug, getPrimarySlug, nameToSlugs } from '../../utils/text';
import { matchesSearchText } from '../../utils/search';
import type { SearchMode } from '../../utils/search';
import {
	fetchWeaponIndex,
	fetchWeaponMasteryTable as fetchMasteryTable,
	fetchWeaponPropertyTable as fetchPropertyTable,
} from './weaponFetcher';
import { getWikiTableColumnValues } from '../../utils/wikiTable';
import type { WikiCellTableData } from '../../utils/wikiTable';
import type { WeaponTypeDirective } from './weaponListCacheItem';
import type { WeaponIndex, WeaponIndexEntry } from './weaponTypes';
import { STATIC_WEAPON_TYPES } from '../../data/staticData';
import {
	getCachedHomebrewWeaponData,
	getCachedHomebrewWeaponIds,
} from '../../homebrew/homebrewService';
import type { HomebrewWeaponData } from '../../homebrew/homebrewService';
import { is2024Source } from '../../utils/wikiPageFetcher';

export const weaponIdCache = new IdCache();
const weaponPropertyCache = new IdCache();
const weaponMasteryCache = new IdCache();
const weaponIndexCache = new Map<string, WeaponIndex>();
const weaponPropertyTableCache = new Map<string, WikiCellTableData | null>();
const weaponMasteryTableCache = new Map<string, WikiCellTableData | null>();

/** Return the preloaded weapon IDs for a source URL. */
export function getKnownWeaponIdsForKey(urlKey: string): string[] {
	return Array.from(new Set([...weaponIdCache.get(urlKey), ...getCachedHomebrewWeaponIds()]));
}

/** Return the fetched weapon properties for a source URL. */
export function getKnownWeaponPropertiesForKey(urlKey: string): string[] {
	return weaponPropertyCache.get(urlKey);
}

/** Return the fetched weapon masteries for a source URL. */
export function getKnownWeaponMasteriesForKey(urlKey: string): string[] {
	return weaponMasteryCache.get(urlKey);
}

/** Load weapon names and properties for the weapon suggesters. */
export async function preloadWeaponData(urlKey: string, baseUrl: string): Promise<void> {
	const [index, propertyTable] = await Promise.all([
		getWeaponIndex(urlKey, baseUrl, 'all'),
		getWeaponPropertyTable(baseUrl),
	]);
	weaponIdCache.addMany(urlKey, index.items.map(item => getPrimarySlug(item.name)).filter(Boolean));
	if (propertyTable) {
		weaponPropertyCache.addMany(urlKey, getWikiTableColumnValues(propertyTable, 0));
	}
	const masteryTable = await getWeaponMasteryTable(baseUrl);
	if (masteryTable) {
		weaponMasteryCache.addMany(urlKey, getWikiTableColumnValues(masteryTable, 0));
	}
}

/** Return the weapon index through the weapon table fetcher. */
export async function getWeaponIndex(
	urlKey: string,
	baseUrl: string,
	typeDirective: WeaponTypeDirective,
	): Promise<WeaponIndex> {
	const weaponTypes = getWeaponTypesToFetch(typeDirective);
	const cacheKey = `${urlKey}|types:${weaponTypes.join(',')}`;
	const index = weaponIndexCache.get(cacheKey) ?? await fetchWeaponIndex(baseUrl, weaponTypes);
	weaponIndexCache.set(cacheKey, index);
	const homebrewItems = await getHomebrewWeaponEntries(index.items, baseUrl, typeDirective);
	return homebrewItems.length
		? { items: [...index.items, ...homebrewItems] }
		: index;
}

function getWeaponTypesToFetch(typeDirective: WeaponTypeDirective): string[] {
	if (typeDirective === 'all' || !Array.isArray(typeDirective) || !typeDirective.length) {
		return Array.from(STATIC_WEAPON_TYPES.keys());
	}
	return Array.from(new Set(typeDirective.map(normalizeWeaponType).filter(Boolean)));
}

/** Convert homebrew weapon metadata into the same rows used by fetched weapons. */
async function getHomebrewWeaponEntries(
	fetchedItems: WeaponIndexEntry[],
	baseUrl: string,
	typeDirective: WeaponTypeDirective,
): Promise<WeaponIndexEntry[]> {
	const candidates = getCachedHomebrewWeaponIds();
	const entries = await Promise.all(candidates.map(async (id) => {
		const data = await getCachedHomebrewWeaponData(id);
		if (!data) return null;

		const normalizedType = normalizeWeaponType(data.type);
		if (Array.isArray(typeDirective)
			&& typeDirective.length
			&& !typeDirective.includes(normalizedType)) return null;

		const sourceTable = fetchedItems.find(item =>
			normalizeWeaponType(item.weaponType ?? '') === normalizedType && item.table,
		)?.table ?? fetchedItems.find(item => item.table)?.table;
		const headers = sourceTable?.headers ?? getFallbackWeaponHeaders(baseUrl);
		const name = displayNameFromSlug(id);
		return {
			name,
			type: 'weapons',
			weaponType: normalizedType,
			table: {
				headers,
				values: headers.map(header => getHomebrewWeaponCellValue(header, name, data)),
			},
		};
	}));
	return entries.filter((entry): entry is Exclude<typeof entry, null> => entry !== null);
}

function getFallbackWeaponHeaders(baseUrl: string): string[] {
	return is2024Source(baseUrl)
		? ['Name', 'Cost', 'Damage', 'Weight', 'Properties', 'Mastery']
		: ['Name', 'Cost', 'Damage', 'Weight', 'Properties'];
}

function getHomebrewWeaponCellValue(
	header: string,
	name: string,
	data: HomebrewWeaponData,
): string {
	const normalizedHeader = header.trim().toLowerCase();
	if (normalizedHeader === 'name') return name;
	if (normalizedHeader === 'type') return data.type;
	if (normalizedHeader === 'cost') return data.cost;
	if (normalizedHeader === 'damage') return data.damage;
	if (normalizedHeader === 'weight') return data.weight;
	if (normalizedHeader === 'properties') return data.properties.join(', ');
	if (normalizedHeader === 'mastery') return data.mastery;
	return '';
}

/** Return unique weapon names after applying the type filter. */
export function filterWeaponNames(
	items: WeaponIndexEntry[],
	type: WeaponTypeDirective,
): string[] {
	const filteredItems = Array.isArray(type) && type.length
		? items.filter(item => item.weaponType !== undefined
			&& type.includes(normalizeWeaponType(item.weaponType)))
		: items;

	return Array.from(new Set(filteredItems.map(item => item.name).filter(Boolean)));
}

/** Apply weapon property, mastery, and full-text search filters. */
export function filterWeaponEntries(
	entries: WeaponIndexEntry[],
	properties: string[],
	mastery: string[],
	searches: string[],
	searchMode: SearchMode,
): WeaponIndexEntry[] {
	return entries
		.filter(entry => matchesWeaponProperties(entry, properties))
		.filter(entry => matchesWeaponMastery(entry, mastery))
		.filter(entry => matchesWeaponSearch(entry, searches, searchMode));
}

function matchesWeaponProperties(entry: WeaponIndexEntry, properties: string[]): boolean {
	if (!properties.length) return true;

	const propertyColumnIndex = entry.table?.headers.findIndex(header =>
		header.trim().toLowerCase() === 'properties',
	) ?? -1;
	if (propertyColumnIndex === -1) return false;

	const propertyText = entry.table?.values[propertyColumnIndex]?.toLowerCase() ?? '';
	return properties.some(property => propertyText.includes(property));
}

function matchesWeaponMastery(entry: WeaponIndexEntry, mastery: string[]): boolean {
	if (!mastery.length) return true;

	const masteryColumnIndex = entry.table?.headers.findIndex(header =>
		header.trim().toLowerCase() === 'mastery',
	) ?? -1;
	if (masteryColumnIndex === -1) return false;

	const masteryText = entry.table?.values[masteryColumnIndex]?.toLowerCase() ?? '';
	return mastery.some(value => masteryText.includes(value));
}

function matchesWeaponSearch(
	entry: WeaponIndexEntry,
	searches: string[],
	searchMode: SearchMode,
): boolean {
	const tableValues = entry.table?.values ?? [];
	return matchesSearchText([entry.name, ...tableValues].join(' '), searches, searchMode);
}

/** Normalize a weapon type for comparisons and headings. */
export function normalizeWeaponType(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, '-');
}

/** Find a weapon entry by any compatible slug generated from its name. */
export function findWeaponEntry(
	index: WeaponIndex,
	weaponName: string,
	): WeaponIndexEntry | null {
	const requestedSlugs = new Set(nameToSlugs(weaponName));
	return index.items.find(item =>
		nameToSlugs(item.name).some(slug => requestedSlugs.has(slug)),
	) ?? null;
}

export interface WeaponTableGroup {
	headers: string[];
	rows: string[][];
}

/** Keep only reference properties used by the weapons in the visible main table. */
export function filterWeaponPropertyTable(
	table: WikiCellTableData,
	entries: WeaponIndexEntry[],
): WikiCellTableData {
	return filterWeaponReferenceTable(table, entries, ['property', 'properties']);
}

/** Keep only reference masteries used by the weapons in the visible main table. */
export function filterWeaponMasteryTable(
	table: WikiCellTableData,
	entries: WeaponIndexEntry[],
): WikiCellTableData {
	return filterWeaponReferenceTable(table, entries, ['mastery']);
}

function filterWeaponReferenceTable(
	table: WikiCellTableData,
	entries: WeaponIndexEntry[],
	columnNames: string[],
): WikiCellTableData {
	const usedReferenceNames = entries
		.map(entry => {
			const propertyColumnIndex = entry.table?.headers.findIndex(header => {
				const normalizedHeader = header.trim().toLowerCase();
				return columnNames.includes(normalizedHeader);
			}) ?? -1;
			return propertyColumnIndex >= 0
				? entry.table?.values[propertyColumnIndex]?.toLowerCase() ?? ''
				: '';
		})
		.filter(Boolean);
	return {
		rows: table.rows.filter((row, rowIndex) => {
			if (rowIndex === 0) return true;
			const referenceName = row[0]?.text.trim().toLowerCase() ?? '';
			return Boolean(referenceName)
				&& usedReferenceNames.some(value => value.includes(referenceName));
		}),
	};
}

/** Fetch and cache the property table from the weapons page. */
export async function getWeaponPropertyTable(baseUrl: string): Promise<WikiCellTableData | null> {
	if (weaponPropertyTableCache.has(baseUrl)) {
		return weaponPropertyTableCache.get(baseUrl) ?? null;
	}

	const table = await fetchPropertyTable(baseUrl);
	weaponPropertyTableCache.set(baseUrl, table);
	return table;
}

/** Fetch and cache the 2024 mastery table from the weapons page. */
export async function getWeaponMasteryTable(baseUrl: string): Promise<WikiCellTableData | null> {
	if (weaponMasteryTableCache.has(baseUrl)) {
		return weaponMasteryTableCache.get(baseUrl) ?? null;
	}

	const table = await fetchMasteryTable(baseUrl);
	weaponMasteryTableCache.set(baseUrl, table);
	return table;
}

/** Group weapon rows by their source table layout so columns stay aligned. */
export function groupWeaponTableRows(entries: WeaponIndexEntry[]): WeaponTableGroup[] {
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
