export interface FilteredListCacheItem {
	readonly name: string;
	buildCacheKey(urlKey: string): string;
}

/** In-memory cache for filtered list results. */
export class FilteredListCache<TItem extends FilteredListCacheItem, TValue> {
	private readonly values = new Map<string, TValue>();

	get(urlKey: string, item: TItem): TValue | null {
		return this.values.get(item.buildCacheKey(urlKey)) ?? null;
	}

	set(urlKey: string, item: TItem, value: TValue): void {
		this.values.set(item.buildCacheKey(urlKey), value);
	}
}
