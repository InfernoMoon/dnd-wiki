import type { FilteredListCacheItem } from '../../cache/filteredListCache';

export type EquipmentTypeDirective = string[] | 'all' | null;

/** Cache key for an equipment list filtered by equipment type. */
export class EquipmentListCacheItem implements FilteredListCacheItem {
	readonly name = 'equipment';

	constructor(readonly typeDirective: EquipmentTypeDirective) {}

	buildCacheKey(urlKey: string): string {
		const typeKey = Array.isArray(this.typeDirective) && this.typeDirective.length
			? this.typeDirective.slice().sort().join(',')
			: this.typeDirective === 'all'
			? 'all'
			: 'null';
		return `${this.name}|${urlKey}|types:${typeKey}`;
	}
}
