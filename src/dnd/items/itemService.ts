import { IdCache } from '../../cache/idCache';
import { RenderCache } from '../../cache/renderCache';
import type { CachedRender } from '../../cache/renderCache';
import { requestUrl } from 'obsidian';
import { displayNameFromSlug } from '../../utils/text';
import { fetchPageContent } from '../../utils/fetcher';
import { loadFromTable, LoaderConfig } from '../../genericLoader';
import { STATIC_ITEM_TYPES } from '../../data/staticData';

export const itemIdCache = new IdCache();
const itemRenderCache = new RenderCache<CachedRender>();
const itemTypeCache = new Map<string, string>();

export interface ItemIndexEntry {
	name: string;
	type: string;
	requiresAttunement: boolean;
}

export interface ItemIndex {
	document: Document;
	items: ItemIndexEntry[];
}

const itemIndexCache = new Map<string, ItemIndex>();

export function getItemIndexPath(baseUrl: string): string {
	return baseUrl.includes('2024') ? '/magic-item:all' : '/wondrous-items';
}

export function getItemCollectionName(baseUrl: string): string {
	return baseUrl.includes('2024') ? 'Magic Items' : 'Wondrous Items';
}

export async function ensureItemCached(
	itemId: string,
	urlKey: string,
	baseUrl: string,
): Promise<CachedRender | null> {
	const existing = itemRenderCache.get(urlKey, itemId);
	if (existing) return existing;

	const itemPageType = baseUrl.includes('2024') ? 'magic-item' : 'wondrous-items';
	const fetched = await fetchPageContent(baseUrl, itemPageType, itemId);
	if (!fetched.ok) return null;

	const cached: CachedRender = {
		title: fetched.titleText || displayNameFromSlug(itemId),
		html: fetched.contentHtml,
	};
	itemRenderCache.set(urlKey, itemId, cached);
	return cached;
}

export function getItemTypeSuggestions(): string[] {
	return Array.from(new Set([...STATIC_ITEM_TYPES, ...itemTypeCache.values()]))
		.sort((a, b) => a.localeCompare(b));
}

export async function getItemIndex(urlKey: string, baseUrl: string): Promise<ItemIndex | null> {
	const cacheKey = `${urlKey}|${getItemIndexPath(baseUrl)}`;
	const existing = itemIndexCache.get(cacheKey);
	if (existing) return existing;

	try {
		const base = baseUrl.replace(/\/$/, '');
		const response = await requestUrl({
			url: `${base}${getItemIndexPath(baseUrl)}`,
			method: 'GET',
		});
		if (response.status < 200 || response.status >= 300) return null;

		const document = new DOMParser().parseFromString(response.text, 'text/html');
		const index: ItemIndex = {
			document,
			items: extractItemIndexEntries(document),
		};
		itemIndexCache.set(cacheKey, index);
		return index;
	} catch {
		return null;
	}
}

export async function preloadAllItemIds(urlKey: string, baseUrl: string): Promise<void> {
	const rowProcessor = (row: Element, _name: string): void => {
		const cells = Array.from(row.querySelectorAll('td'));
		const nameIndex = cells.findIndex(cell => !!cell.querySelector('a[href]'));
		const type = (cells[nameIndex + 1]?.textContent || '').trim();
		if (type) itemTypeCache.set(type.toLowerCase(), type);
	};

	const config: Omit<LoaderConfig, 'indexPath'> = {
		baseUrl,
		tableRowSelector: 'table tr',
		tableCellSelector: 'td a[href]',
		useLinkMethod: false,
		useTableMethod: true,
		rowProcessor,
	};
	const [wondrousIds, magicItemIds] = await Promise.all([
		loadFromTable({ ...config, indexPath: '/wondrous-items' }),
		loadFromTable({ ...config, indexPath: '/magic-item:all' }),
	]);
	itemIdCache.addMany(urlKey, wondrousIds);
	itemIdCache.addMany(urlKey, magicItemIds);
}

function extractItemIndexEntries(root: Document | Element): ItemIndexEntry[] {
	const rows = Array.from(root.querySelectorAll('table tr'));
	const items: ItemIndexEntry[] = [];

	for (const row of rows) {
		const cells = Array.from(row.querySelectorAll('td'));
		const nameIndex = cells.findIndex(cell => !!cell.querySelector('a[href]'));
		if (nameIndex === -1) continue;

		const name = cells[nameIndex].querySelector('a[href]')?.textContent?.trim() ?? '';
		if (!name) continue;

		const type = cells[nameIndex + 1]?.textContent?.trim() ?? '';
		const attunementText = cells[nameIndex + 2]?.textContent ?? '';
		items.push({
			name,
			type,
			requiresAttunement: /attuned/i.test(attunementText),
		});
	}

	return items;
}
