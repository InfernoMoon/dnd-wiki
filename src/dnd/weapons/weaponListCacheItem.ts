import type { FilteredListCacheItem } from '../../cache/filteredListCache';

export type WeaponTypeDirective = string[] | 'all' | null;

export class WeaponListCacheItem implements FilteredListCacheItem {
	readonly name = 'weapons';

	constructor(readonly typeDirective: WeaponTypeDirective) {}

	buildCacheKey(urlKey: string): string {
		const typeKey = Array.isArray(this.typeDirective) && this.typeDirective.length
			? this.typeDirective.slice().sort().join(',')
			: this.typeDirective === 'all'
			? 'all'
			: 'null';

		return `${this.name}|${urlKey}|types:${typeKey}`;
	}
}
