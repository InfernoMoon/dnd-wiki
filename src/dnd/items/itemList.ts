import type { MarkdownPostProcessorContext } from 'obsidian';
import { FilteredListCache } from '../../cache/filteredListCache';
import { getTextProperties } from '../../utils/directives';
import { extractTableNamesFromFirstCell } from '../../utils/dom';
import { renderCollapsible, requireBaseUrl } from '../../utils/renderer';
import { matchesSearch, parseSearchDirective, parseSearchModeDirective } from '../../utils/search';
import type { SearchMode } from '../../utils/search';
import { displayNameFromSlug, getPrimarySlug } from '../../utils/text';
import { STATIC_ITEM_RARITY_WORD_TO_INDEX } from '../../data/staticData';
import {
	ensureItemCached,
	getItemCollectionName,
	getItemIndex,
} from './itemService';
import type { ItemIndex, ItemIndexEntry } from './itemService';
import { ItemListCacheItem } from './itemListCacheItem';
import type { LevelDirective } from './itemListCacheItem';

type TypeDirective = string[] | 'all' | null;
type AttunedDirective = 'all' | boolean | null;

interface ItemListDirectives {
	level: LevelDirective;
	type: TypeDirective;
	attuned: AttunedDirective;
	searches: string[];
	searchMode: SearchMode;
}

interface FilteredItemsResult {
	names: string[];
	message?: string;
}

interface LevelFilterResult {
	items: ItemIndexEntry[] | null;
	message?: string;
}

const LEVEL_INDEX_TO_WORD = Object.entries(STATIC_ITEM_RARITY_WORD_TO_INDEX)
	.reduce<Record<number, string>>((result, [word, index]) => {
		result[index] = word;
		return result;
	}, {});

const itemListCache = new FilteredListCache<ItemListCacheItem, string[]>();

export async function renderItemList(
	source: string,
	el: HTMLElement,
	_ctx: MarkdownPostProcessorContext | undefined,
	urlKey: string,
	baseUrl: string,
): Promise<void> {
	el.empty();
	if (!requireBaseUrl(el, baseUrl)) return;

	const directives = parseItemListDirectives(source);
	const cacheItem = new ItemListCacheItem(
		directives.level,
		directives.type,
		directives.attuned,
	);

	let names = itemListCache.get(urlKey, cacheItem);
	if (names === null) {
		const index = await getItemIndex(urlKey, baseUrl);
		if (!index) {
			el.setText(`Failed to load ${getItemCollectionName(baseUrl).toLowerCase()} index.`);
			return;
		}

		const result = filterItems(index, directives);
		if (result.message) {
			el.setText(result.message);
			return;
		}

		names = result.names;
		itemListCache.set(urlKey, cacheItem, names);
	}

	if (!names.length) {
		el.setText(`No ${getItemCollectionName(baseUrl)} found`);
		return;
	}

	el.createEl('h2', {
		cls: 'dnd-wiki-list-heading',
		text: buildHeading(getItemCollectionName(baseUrl), directives.level),
	});

	const container = el.createDiv();
	await renderItemCards(
		names,
		container,
		urlKey,
		baseUrl,
		directives.searches,
		directives.searchMode,
	);
}

function parseItemListDirectives(source: string): ItemListDirectives {
	const properties = getTextProperties(source, ['level', 'type', 'attuned']);

	return {
		level: parseLevelDirective(properties.get('level') ?? []),
		type: parseTypeDirective(properties.get('type') ?? []),
		attuned: parseAttunedDirective(properties.get('attuned') ?? []),
		searches: parseSearchDirective(source),
		searchMode: parseSearchModeDirective(source),
	};
}

function parseLevelDirective(values: string[]): LevelDirective {
	const raw = values.join(',').trim();
	if (!raw || raw.toLowerCase() === 'all') return null;

	const levels: number[] = [];
	for (const token of raw.split(',')) {
		levels.push(...parseLevelToken(token));
	}

	const uniqueLevels = Array.from(new Set(levels)).sort((a, b) => a - b);
	if (!uniqueLevels.length) return null;

	return uniqueLevels.length === 1 ? uniqueLevels[0] : uniqueLevels;
}

function parseLevelToken(token: string): number[] {
	const value = token.trim();

	if (/^\d+$/.test(value)) {
		const level = Number.parseInt(value, 10);
		return level >= 0 && level <= 7 ? [level] : [];
	}

	const range = /^(\d+)\s*-\s*(\d+)$/.exec(value);
	if (range) {
		return expandLevelRange(
			Number.parseInt(range[1], 10),
			Number.parseInt(range[2], 10),
		);
	}

	const rarityLevel = STATIC_ITEM_RARITY_WORD_TO_INDEX[
		value.replace(/\s+/g, '-').toLowerCase()
	];
	return rarityLevel === undefined ? [] : [rarityLevel];
}

function expandLevelRange(start: number, end: number): number[] {
	const first = Math.min(start, end);
	const last = Math.max(start, end);
	if (last < 0 || first > 7) return [];

	const boundedFirst = Math.max(0, first);
	const boundedLast = Math.min(7, last);

	const levels: number[] = [];
	for (let level = boundedFirst; level <= boundedLast; level++) {
		levels.push(level);
	}
	return levels;
}

function parseTypeDirective(values: string[]): TypeDirective {
	if (!values.length) return null;

	const raw = values.join(',').trim();
	if (/^all$/i.test(raw)) return 'all';

	return raw
		.split(',')
		.map(value => value.trim().toLowerCase().replace(/\s+/g, '-'))
		.filter(Boolean);
}

function parseAttunedDirective(values: string[]): AttunedDirective {
	const value = values[0]?.toLowerCase().trim();
	if (!value) return null;
	if (value === 'all') return 'all';
	if (value === 'true' || value === 'required') return true;
	if (value === 'false' || value === 'not-required') return false;
	return null;
}

function filterItems(index: ItemIndex, directives: ItemListDirectives): FilteredItemsResult {
	const levelResult = filterItemsByLevel(index, directives.level);
	if (levelResult.items === null) {
		return { names: [], message: levelResult.message };
	}

	let items = levelResult.items;
	if (Array.isArray(directives.type) && directives.type.length) {
		const types = new Set(directives.type);
		items = items.filter(item => types.has(normalizeType(item.type)));
	}

	if (typeof directives.attuned === 'boolean') {
		items = items.filter(item => item.requiresAttunement === directives.attuned);
	}

	return { names: uniqueItemNames(items) };
}

function filterItemsByLevel(
	index: ItemIndex,
	level: LevelDirective,
): LevelFilterResult {
	const levels = typeof level === 'number'
		? [level]
		: Array.isArray(level)
		? level
		: [];
	if (!levels.length) return { items: index.items };

	const allowedNames = new Set<string>();
	for (const itemLevel of levels) {
		const tab = index.document.querySelector(`#wiki-tab-0-${itemLevel}`);
		if (!tab) continue;

		for (const name of extractTableNamesFromFirstCell(tab)) {
			allowedNames.add(getPrimarySlug(name));
		}
	}

	if (!allowedNames.size) {
		return {
			items: null,
			message: `No items found for levels ${levels.join(', ')}`,
		};
	}

	return {
		items: index.items.filter(item => allowedNames.has(getPrimarySlug(item.name))),
	};
}

function normalizeType(type: string): string {
	return type.trim().toLowerCase().replace(/\s+/g, '-');
}

function uniqueItemNames(items: ItemIndexEntry[]): string[] {
	return Array.from(new Map(
		items.map(item => [getPrimarySlug(item.name), item.name]),
	).values());
}

function buildHeading(collectionName: string, level: LevelDirective): string {
	if (Array.isArray(level) && level.length) {
		return `${collectionName} ${level.map(levelIndexToName).join(', ')}`;
	}
	if (typeof level === 'number') {
		return `${collectionName} ${levelIndexToName(level)}`;
	}
	return `All ${collectionName}`;
}

function levelIndexToName(index: number): string {
	return displayNameFromSlug(LEVEL_INDEX_TO_WORD[index] ?? String(index));
}

async function renderItemCards(
	names: string[],
	container: HTMLElement,
	urlKey: string,
	baseUrl: string,
	searches: string[],
	searchMode: SearchMode,
): Promise<void> {
	await Promise.all(names.map(async name => {
		const host = container.createDiv('dnd-wiki-card-spacer');
		const itemId = getPrimarySlug(name);
		const cached = await ensureItemCached(name, urlKey, baseUrl);

		if (cached?.html) {
			renderCollapsible(host, cached.title, cached.html);
			if (!matchesSearch(cached, searches, searchMode)) {
				host.classList.add('dnd-wiki-search-hidden');
			}
		} else {
			host.textContent = `Failed to load item: ${displayNameFromSlug(itemId)}`;
			if (searches.length) {
				host.classList.add('dnd-wiki-search-hidden');
			}
		}
	}));
}
