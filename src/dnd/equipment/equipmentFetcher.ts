import { requestUrl } from 'obsidian';
import { STATIC_EQUIPMENT_TYPES } from '../../data/staticData';
import type { EquipmentFetchSettings, EquipmentIndex, EquipmentIndexEntry } from './equipmentService';
import { getWikiContentTables, getWikiTablesByFirstHeader } from '../../utils/wikiTable';
import type { WikiCellTableData, WikiTableData } from '../../utils/wikiTable';
import { is2024Source } from '../../utils/wikiPageFetcher';

/** Fetch all requested equipment categories and combine their entries. */
export async function fetchEquipmentIndex(
	baseUrl: string,
	settings: EquipmentFetchSettings,
): Promise<EquipmentIndex> {
	const fetches: Array<Promise<EquipmentIndexEntry[]>> = [];
	if (settings.includeArmorAndShields) fetches.push(fetchArmorAndShields(baseUrl));
	if (settings.includeWeapons) fetches.push(fetchWeapons(baseUrl, settings.weaponTypes));

	const results = await Promise.all(fetches);
	const items: EquipmentIndexEntry[] = [];
	for (const result of results) items.push(...result);
	return { items };
}

/** Fetch the property table from the shared weapons page. */
export async function fetchWeaponPropertyTable(baseUrl: string): Promise<WikiCellTableData | null> {
	return fetchWeaponReferenceTable(baseUrl, 0);
}

/** Fetch the 2024 mastery table from the shared weapons page. */
export async function fetchWeaponMasteryTable(baseUrl: string): Promise<WikiCellTableData | null> {
	if (!is2024Source(baseUrl)) return null;
	return fetchWeaponReferenceTable(baseUrl, 1);
}

async function fetchWeaponReferenceTable(baseUrl: string, tableIndex: number): Promise<WikiCellTableData | null> {
	const document = await fetchDocument(baseUrl, 'weapons');
	if (!document) return null;

	const tables = getWikiTablesByFirstHeader(
		document,
		header => header.trim().toLowerCase().startsWith('property'),
	);
	return tables[tableIndex] ?? null;
}

/** Fetch and parse the armor and shields equipment page. */
async function fetchArmorAndShields(baseUrl: string): Promise<EquipmentIndexEntry[]> {
	const armorPath = STATIC_EQUIPMENT_TYPES.has('armor') ? 'armor' : '';
	const document = await fetchDocument(baseUrl, armorPath);
	if (!document) return [];

	return parseTables(getWikiContentTables(document), 'armor-and-shields');
}

/** Fetch and parse weapon tables whose headings match the requested weapon types. */
async function fetchWeapons(baseUrl: string, weaponTypes: string[]): Promise<EquipmentIndexEntry[]> {
	const weaponPath = STATIC_EQUIPMENT_TYPES.has('weapons') ? 'weapons' : '';
	const document = await fetchDocument(baseUrl, weaponPath);
	if (!document) return [];

	const items: EquipmentIndexEntry[] = [];
	for (const weaponType of weaponTypes) {
		const tables = getWikiContentTables(document, header => matchesWeaponHeader(header, weaponType));
		items.push(...parseTables(tables, 'weapons', weaponType));
	}
	return items;
}

async function fetchDocument(baseUrl: string, path: string): Promise<Document | null> {
	if (!path) return null;

	try {
		const response = await requestUrl({
			url: `${baseUrl.replace(/\/+$/, '')}/${path}`,
			method: 'GET',
		});
		if (response.status < 200 || response.status >= 300) return null;
		return new DOMParser().parseFromString(response.text, 'text/html');
	} catch {
		return null;
	}
}

function parseTables(tables: WikiTableData[], type: string, weaponType?: string): EquipmentIndexEntry[] {
	const items: EquipmentIndexEntry[] = [];
	for (const table of tables) items.push(...parseTable(table, type, weaponType));
	return items;
}

function parseTable(
	table: WikiTableData,
	type: string,
	weaponType: string | undefined,
): EquipmentIndexEntry[] {
	const items: EquipmentIndexEntry[] = [];
	const nameIndex = table.headers.findIndex(value => value.toLowerCase() === 'name');
	const resolvedNameIndex = nameIndex >= 0 ? nameIndex : 0;

	for (const row of table.rows) {
		const name = row[resolvedNameIndex] ?? '';
		if (!name) continue;

		items.push({
			name,
			type,
			weaponType,
			table: {
				headers: table.headers,
				values: row,
			},
			render: {
				title: name,
				html: renderTableFields(table.headers, row, resolvedNameIndex),
			},
		});
	}
	return items;
}

function renderTableFields(headers: string[], row: string[], nameIndex: number): string {
	const fields: string[] = [];
	for (let index = 0; index < headers.length; index++) {
		if (index === nameIndex) continue;
		const label = headers[index]?.trim();
		const value = row[index]?.trim();
		if (!label || !value) continue;
		fields.push(`<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`);
	}
	return fields.join('');
}

function matchesWeaponHeader(header: string, weaponType: string): boolean {
	const normalizedHeader = normalizeWeaponType(header);
	return normalizedHeader === weaponType || normalizedHeader === `${weaponType}-weapons`;
}

function normalizeWeaponType(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/-+$/, '');
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
