import type { FilteredListCacheItem } from '../../cache/filteredListCache';

export type SpellLevelDirective = number | number[] | 'all' | null;
export type SpellFilterDirective = string[] | 'all' | null;

/** Identifies one cached spell-list filter combination. */
export class SpellListCacheItem implements FilteredListCacheItem {
	readonly name = 'spells';

	constructor(
		readonly levelDirective: SpellLevelDirective,
		readonly classDirective: SpellFilterDirective,
		readonly schoolDirective: SpellFilterDirective,
	) {}

	buildCacheKey(urlKey: string): string {
		return [
			this.name,
			urlKey,
			buildLevelKey(this.levelDirective),
			buildFilterKey('classes', this.classDirective),
			buildFilterKey('schools', this.schoolDirective),
		].join('|');
	}
}

function buildLevelKey(level: SpellLevelDirective): string {
	if (Array.isArray(level)) return `levels:${level.join(',')}`;
	if (typeof level === 'number') return `level:${level}`;
	return level === 'all' ? 'level:all' : 'level:null';
}

function buildFilterKey(prefix: string, values: SpellFilterDirective): string {
	if (Array.isArray(values) && values.length) {
		return `${prefix}:${values.slice().sort().join(',')}`;
	}
	return values === 'all' ? `${prefix}:all` : `${prefix}:null`;
}
