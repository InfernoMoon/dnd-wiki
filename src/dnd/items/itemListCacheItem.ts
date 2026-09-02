import type { FilteredListCacheItem } from '../../cache/filteredListCache';

export type LevelDirective = number | number[] | 'all' | null;

export class ItemListCacheItem implements FilteredListCacheItem {
	readonly name = 'items';

	constructor(
		readonly levelDirective: LevelDirective,
		readonly typeDirective: string[] | 'all' | null,
		readonly attunedDirective: 'all' | boolean | null,
	) {}

	buildCacheKey(urlKey: string): string {
		const levelKey = Array.isArray(this.levelDirective)
			? `levels:${this.levelDirective.join(',')}`
			: typeof this.levelDirective === 'number'
			? `level:${this.levelDirective}`
			: this.levelDirective === 'all'
			? 'level:all'
			: 'level:null';
		const typeKey = Array.isArray(this.typeDirective) && this.typeDirective.length
			? `types:${this.typeDirective.slice().map(type => type.toLowerCase()).sort().join(',')}`
			: this.typeDirective === 'all'
			? 'types:all'
			: 'types:null';
		const attunedKey = this.attunedDirective === 'all'
			? 'attuned:all'
			: this.attunedDirective === true
			? 'attuned:true'
			: this.attunedDirective === false
			? 'attuned:false'
			: 'attuned:null';

		return `${this.name}|${urlKey}|${levelKey}|${typeKey}|${attunedKey}`;
	}
}
