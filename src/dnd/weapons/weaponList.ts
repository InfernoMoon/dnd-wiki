import type { MarkdownPostProcessorContext } from 'obsidian';
import { FilteredListCache } from '../../cache/filteredListCache';
import type { EquipmentIndexEntry } from '../equipment/equipmentService';
import { getTextProperties } from '../../utils/directives';
import { renderCellTable, renderNoResultsMessage, renderTable, requireBaseUrl } from '../../utils/renderer';
import { parseSearchDirective, parseSearchModeDirective } from '../../utils/search';
import type { SearchMode } from '../../utils/search';
import { displayNameFromSlug } from '../../utils/text';
import {
	filterWeaponEntries,
	filterWeaponNames,
	findWeaponEntry,
	getWeaponCollectionName,
	getWeaponIndex,
	getWeaponPropertyTable,
	groupWeaponTableRows,
	normalizeWeaponType,
} from './weaponService';
import { is2024Source } from '../../utils/wikiPageFetcher';
import { WeaponListCacheItem } from './weaponListCacheItem';
import type { WeaponTypeDirective } from './weaponListCacheItem';
import { STATIC_WEAPON_TYPES } from '../../data/staticData';

interface WeaponListDirectives {
	type: WeaponTypeDirective;
	properties: string[];
	mastery: string[];
	propertyTableMode: PropertyTableMode;
	searches: string[];
	searchMode: SearchMode;
}

type PropertyTableMode = 'hide' | 'show' | 'only';

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

	const directives = parseWeaponListDirectives(source, baseUrl);
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

	if (directives.propertyTableMode !== 'only') {
		el.createEl('h2', {
			cls: 'dnd-wiki-list-heading',
			text: buildHeading(directives.type),
		});
	}

	const entries = names
		.map(name => findWeaponEntry(index, name))
		.filter((entry): entry is EquipmentIndexEntry => entry !== null);
	const filteredEntries = filterWeaponEntries(
		entries,
		directives.properties,
		directives.mastery,
		directives.searches,
		directives.searchMode,
	);
	const missingNames = names.filter(name => !findWeaponEntry(index, name));
	const container = el.createDiv();
	const tableGroups = groupWeaponTableRows(filteredEntries);
	if (directives.propertyTableMode !== 'only') {
		for (const group of tableGroups) {
			renderTable(container, group.headers, group.rows);
		}
	}
	if (directives.propertyTableMode !== 'hide') {
		const propertyTable = await getWeaponPropertyTable(baseUrl);
		if (propertyTable) renderCellTable(container, propertyTable);
	}
	if (directives.propertyTableMode !== 'only') {
		for (const name of directives.searches.length ? [] : missingNames) {
			container.createDiv({ text: `Failed to load weapon: ${displayNameFromSlug(name)}` });
		}
	}

	if (directives.propertyTableMode !== 'only' && !filteredEntries.length) {
		renderNoResultsMessage(container, 'weapons');
	}
}

function parseWeaponListDirectives(source: string, baseUrl: string): WeaponListDirectives {
	const properties = getTextProperties(source, ['type', 'property', 'mastery', 'showPropertyTable']);
	return {
		type: parseWeaponTypeDirective(properties.get('type') ?? []),
		properties: parsePropertyDirective(properties.get('property') ?? []),
		mastery: is2024Source(baseUrl)
			? parseMasteryDirective(properties.get('mastery') ?? [])
			: [],
		propertyTableMode: parsePropertyTableMode(properties.get('showPropertyTable') ?? []),
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

function parsePropertyDirective(values: string[]): string[] {
	return Array.from(new Set(values
		.join(',')
		.split(',')
		.map(value => value.trim().toLowerCase())
		.filter(Boolean)));
}

function parseMasteryDirective(values: string[]): string[] {
	return parseCommaSeparatedValues(values);
}

function parsePropertyTableMode(values: string[]): PropertyTableMode {
	const value = values[0]?.trim().toLowerCase();
	if (value === 'show' || value === 'only') return value;
	return 'hide';
}

function parseCommaSeparatedValues(values: string[]): string[] {
	return Array.from(new Set(values
		.join(',')
		.split(',')
		.map(value => value.trim().toLowerCase())
		.filter(Boolean)));
}

function buildHeading(type: WeaponTypeDirective): string {
	if (type === 'all' || !Array.isArray(type) || !type.length) return 'All Weapons';
	return `${type.map(formatWeaponTypeForHeading).join(', ')} Weapons`;
}

function formatWeaponTypeForHeading(type: string): string {
	return STATIC_WEAPON_TYPES.get(normalizeWeaponType(type)) ?? displayNameFromSlug(type);
}
