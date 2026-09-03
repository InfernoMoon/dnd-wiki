import type { MarkdownPostProcessorContext } from 'obsidian';
import { FilteredListCache } from '../../cache/filteredListCache';
import { getTextProperties } from '../../utils/directives';
import { renderCollapsible, renderNoResultsMessage, requireBaseUrl } from '../../utils/renderer';
import { displayNameFromSlug } from '../../utils/text';
import { STATIC_EQUIPMENT_TYPES } from '../../data/staticData';
import { ensureEquipmentCached, getEquipmentCollectionName, getEquipmentIndex } from './equipmentService';
import type { EquipmentIndexEntry } from './equipmentService';
import { EquipmentListCacheItem } from './equipmentListCacheItem';
import type { EquipmentTypeDirective, WeaponTypeDirective } from './equipmentListCacheItem';

interface EquipmentListDirectives {
	type: EquipmentTypeDirective;
	weaponType: WeaponTypeDirective;
}

const equipmentListCache = new FilteredListCache<EquipmentListCacheItem, string[]>();

export async function renderEquipmentList(
	source: string,
	el: HTMLElement,
	_ctx: MarkdownPostProcessorContext | undefined,
	urlKey: string,
	baseUrl: string,
): Promise<void> {
	el.empty();
	if (!requireBaseUrl(el, baseUrl)) return;

	const directives = parseEquipmentListDirectives(source);
	const cacheItem = new EquipmentListCacheItem(directives.type, directives.weaponType);
	let names = equipmentListCache.get(urlKey, cacheItem);
	if (names === null) {
		const index = await getEquipmentIndex(urlKey, baseUrl, directives.type, directives.weaponType);
		names = filterEquipmentNames(index.items, directives.type, directives.weaponType);
		equipmentListCache.set(urlKey, cacheItem, names);
	}

	if (!names.length) {
		renderNoResultsMessage(el, getEquipmentCollectionName().toLowerCase());
		return;
	}

	el.createEl('h2', {
		cls: 'dnd-wiki-list-heading',
		text: buildHeading(directives.type),
	});

	const container = el.createDiv();
	let renderedCount = 0;
	await Promise.all(names.map(async name => {
		const host = container.createDiv('dnd-wiki-card-spacer');
		const cached = await ensureEquipmentCached(name, urlKey, baseUrl);
		if (!cached) {
			host.textContent = `Failed to load equipment: ${displayNameFromSlug(name)}`;
			return;
		}

		renderCollapsible(host, cached.title, cached.html);
		renderedCount++;
	}));

	if (!renderedCount) renderNoResultsMessage(container, 'equipment');
}

function parseEquipmentListDirectives(source: string): EquipmentListDirectives {
	const properties = getTextProperties(source, ['type', 'weapontype']);
	return {
		type: parseTypeDirective(properties.get('type') ?? []),
		weaponType: parseWeaponTypeDirective(properties.get('weapontype') ?? []),
	};
}

function parseTypeDirective(values: string[]): EquipmentTypeDirective {
	const raw = values.join(',').trim();
	if (!raw || raw.toLowerCase() === 'all') return 'all';

	const types = raw
		.split(',')
		.map(value => normalizeType(value))
		.filter(Boolean);
	return types.length ? Array.from(new Set(types)) : 'all';
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

function filterEquipmentNames(
	items: EquipmentIndexEntry[],
	type: EquipmentTypeDirective,
	weaponType: WeaponTypeDirective,
): string[] {
	let filteredItems = items;
	if (Array.isArray(type) && type.length) {
		const allowedTypes = new Set(type);
		filteredItems = filteredItems.filter(item => allowedTypes.has(normalizeType(item.type)));
	}

	if (Array.isArray(weaponType) && weaponType.length) {
		const allowedWeaponTypes = new Set(weaponType);
		filteredItems = filteredItems.filter(item =>
			normalizeType(item.type) === 'weapons'
			&& item.weaponType !== undefined
			&& allowedWeaponTypes.has(normalizeWeaponType(item.weaponType)),
		);
	}

	return uniqueNames(filteredItems);
}

function uniqueNames(items: EquipmentIndexEntry[]): string[] {
	return Array.from(new Set(items.map(item => item.name).filter(Boolean)));
}

function normalizeType(type: string): string {
	const normalized = type.trim().toLowerCase().replace(/\s+/g, '-');
	if (normalized === 'armor' || normalized === 'armor-and-shields' || normalized === 'armor-and-shield') {
		return 'armor-and-shields';
	}
	if (normalized === 'weapon' || normalized === 'weapons') return 'weapons';
	return normalized;
}

function normalizeWeaponType(type: string): string {
	return type.trim().toLowerCase().replace(/\s+/g, '-');
}

function buildHeading(type: EquipmentTypeDirective): string {
	if (type === 'all' || !Array.isArray(type) || !type.length) return 'All Equipment';
	return type.map(formatEquipmentTypeForHeading).join(', ');
}

function formatEquipmentTypeForHeading(type: string): string {
	const normalized = normalizeType(type);
	if (normalized === 'armor-and-shields') return STATIC_EQUIPMENT_TYPES.get('armor') ?? 'Armor and Shields';
	if (normalized === 'weapons') return STATIC_EQUIPMENT_TYPES.get('weapons') ?? 'Weapons';
	return displayNameFromSlug(type);
}
