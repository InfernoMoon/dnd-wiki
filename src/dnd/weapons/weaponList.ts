import type { MarkdownPostProcessorContext } from 'obsidian';
import { FilteredListCache } from '../../cache/filteredListCache';
import type { EquipmentIndexEntry } from '../equipment/equipmentService';
import { getTextProperties } from '../../utils/directives';
import { renderNoResultsMessage, renderTable, requireBaseUrl } from '../../utils/renderer';
import { matchesSearchText, parseSearchDirective, parseSearchModeDirective } from '../../utils/search';
import type { SearchMode } from '../../utils/search';
import { displayNameFromSlug } from '../../utils/text';
import { findWeaponEntry, getWeaponCollectionName, getWeaponIndex, groupWeaponTableRows } from './weaponService';
import { WeaponListCacheItem } from './weaponListCacheItem';
import type { WeaponTypeDirective } from './weaponListCacheItem';
import { STATIC_WEAPON_TYPES } from '../../data/staticData';

interface WeaponListDirectives {
	type: WeaponTypeDirective;
	searches: string[];
	searchMode: SearchMode;
}

const weaponListCache = new FilteredListCache<WeaponListCacheItem, string[]>();

/** Render a filtered list of weapons. */
export async function renderWeaponList(
	source: string,
	el: HTMLElement,
	_ctx: MarkdownPostProcessorContext | undefined,
	urlKey: string,
	baseUrl: string,
): Promise<void> {
	el.empty();
	if (!requireBaseUrl(el, baseUrl)) return;

	const directives = parseWeaponListDirectives(source);
	const cacheItem = new WeaponListCacheItem(directives.type);
	const index = await getWeaponIndex(urlKey, baseUrl, directives.type);
	let names = weaponListCache.get(urlKey, cacheItem);
	if (names === null) {
		names = filterWeaponNames(index.items, directives.type);
		weaponListCache.set(urlKey, cacheItem, names);
	}

	if (!names.length) {
		renderNoResultsMessage(el, getWeaponCollectionName().toLowerCase());
		return;
	}

	el.createEl('h2', {
		cls: 'dnd-wiki-list-heading',
		text: buildHeading(directives.type),
	});

	const entries = names
		.map(name => findWeaponEntry(index, name))
		.filter((entry): entry is EquipmentIndexEntry => entry !== null)
		.filter(entry => matchesWeaponSearch(entry, directives.searches, directives.searchMode));
	const missingNames = names.filter(name => !findWeaponEntry(index, name));
	const container = el.createDiv();
	for (const group of groupWeaponTableRows(entries)) {
		renderTable(container, group.headers, group.rows);
	}
	for (const name of directives.searches.length ? [] : missingNames) {
		container.createDiv({ text: `Failed to load weapon: ${displayNameFromSlug(name)}` });
	}

	if (!entries.length) renderNoResultsMessage(container, 'weapons');
}

function parseWeaponListDirectives(source: string): WeaponListDirectives {
	const properties = getTextProperties(source, ['type']);
	return {
		type: parseWeaponTypeDirective(properties.get('type') ?? []),
		searches: parseSearchDirective(source),
		searchMode: parseSearchModeDirective(source),
	};
}

function parseWeaponTypeDirective(values: string[]): WeaponTypeDirective {
	const raw = values.join(',').trim();
	if (!raw || raw.toLowerCase() === 'all') return 'all';

	const types = raw
		.split(',')
		.map(value => normalizeWeaponType(value))
		.filter(Boolean);
	return types.length ? Array.from(new Set(types)) : 'all';
}

function filterWeaponNames(items: EquipmentIndexEntry[], type: WeaponTypeDirective): string[] {
	const filteredItems = Array.isArray(type) && type.length
		? items.filter(item => item.weaponType !== undefined
			&& type.includes(normalizeWeaponType(item.weaponType)))
		: items;

	return Array.from(new Set(filteredItems.map(item => item.name).filter(Boolean)));
}

function matchesWeaponSearch(
	entry: EquipmentIndexEntry,
	searches: string[],
	searchMode: SearchMode,
): boolean {
	const tableValues = entry.table?.values ?? [];
	return matchesSearchText([entry.name, ...tableValues].join(' '), searches, searchMode);
}

function normalizeWeaponType(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function buildHeading(type: WeaponTypeDirective): string {
	if (type === 'all' || !Array.isArray(type) || !type.length) return 'All Weapons';
	return `${type.map(formatWeaponTypeForHeading).join(', ')} Weapons`;
}

function formatWeaponTypeForHeading(type: string): string {
	return STATIC_WEAPON_TYPES.get(normalizeWeaponType(type)) ?? displayNameFromSlug(type);
}
