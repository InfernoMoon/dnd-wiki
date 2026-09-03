import { RenderCache } from '../../cache/renderCache';
import type { CachedRender } from '../../cache/renderCache';

export interface EquipmentIndexEntry {
	name: string;
	type: string;
}

export interface EquipmentIndex {
	items: EquipmentIndexEntry[];
}

const equipmentIndexCache = new Map<string, EquipmentIndex>();
const equipmentRenderCache = new RenderCache<CachedRender>();

export function getEquipmentCollectionName(): string {
	return 'Equipment';
}

/**
 * Return the equipment index for a source.
 * Fetching is intentionally deferred; the initial index is empty.
 */
export async function getEquipmentIndex(urlKey: string, _baseUrl: string): Promise<EquipmentIndex> {
	const existing = equipmentIndexCache.get(urlKey);
	if (existing) return existing;

	const emptyIndex: EquipmentIndex = { items: [] };
	equipmentIndexCache.set(urlKey, emptyIndex);
	return emptyIndex;
}

export async function ensureEquipmentCached(
	equipmentName: string,
	urlKey: string,
	_baseUrl: string,
): Promise<CachedRender | null> {
	const equipmentId = equipmentName.trim().toLowerCase();
	if (equipmentId) return equipmentRenderCache.get(urlKey, equipmentId);
	return null;
}
