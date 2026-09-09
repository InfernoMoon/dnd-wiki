import { requestUrl } from 'obsidian';
import { getWikiContentTables, getWikiTablesByFirstHeader } from '../../utils/wikiTable';
import type { WikiCellTableData, WikiTableData } from '../../utils/wikiTable';
import { is2024Source } from '../../utils/wikiPageFetcher';
import type { WeaponIndex, WeaponIndexEntry } from './weaponTypes';

/** Fetch weapon tables for the requested weapon types. */
export async function fetchWeaponIndex(
	baseUrl: string,
	weaponTypes: string[],
): Promise<WeaponIndex> {
	const document = await fetchDocument(baseUrl, 'weapons');
	if (!document) return { items: [] };

	const items: WeaponIndexEntry[] = [];
	for (const weaponType of weaponTypes) {
		const tables = getWikiContentTables(document, header => matchesWeaponHeader(header, weaponType));
		items.push(...parseTables(tables, weaponType));
	}
	return { items };
}

/** Fetch the property reference table from the weapons page. */
export async function fetchWeaponPropertyTable(baseUrl: string): Promise<WikiCellTableData | null> {
	return fetchWeaponReferenceTable(baseUrl, 0);
}

/** Fetch the 2024 mastery reference table from the weapons page. */
export async function fetchWeaponMasteryTable(baseUrl: string): Promise<WikiCellTableData | null> {
	if (!is2024Source(baseUrl)) return null;
	return fetchWeaponReferenceTable(baseUrl, 1);
}

async function fetchWeaponReferenceTable(
	baseUrl: string,
	tableIndex: number,
): Promise<WikiCellTableData | null> {
	const document = await fetchDocument(baseUrl, 'weapons');
	if (!document) return null;

	const tables = getWikiTablesByFirstHeader(
		document,
		header => header.trim().toLowerCase().startsWith('property'),
	);
	return tables[tableIndex] ?? null;
}

async function fetchDocument(baseUrl: string, path: string): Promise<Document | null> {
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

function parseTables(tables: WikiTableData[], weaponType: string): WeaponIndexEntry[] {
	const items: WeaponIndexEntry[] = [];
	for (const table of tables) {
		const nameIndex = table.headers.findIndex(value => value.toLowerCase() === 'name');
		const resolvedNameIndex = nameIndex >= 0 ? nameIndex : 0;

		for (const row of table.rows) {
			const name = row[resolvedNameIndex] ?? '';
			if (!name) continue;

			items.push({
				name,
				type: 'weapons',
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
