export interface CachedRender {
	title: string;
	html: string;
}

/** In-memory cache for rendered entries grouped by source URL. */
export class RenderCache<T extends CachedRender = CachedRender> {
	private readonly entries = new Map<string, Map<string, T>>();

	private getEntriesForKey(urlKey: string): Map<string, T> {
		const existing = this.entries.get(urlKey);
		if (existing) return existing;

		const created = new Map<string, T>();
		this.entries.set(urlKey, created);
		return created;
	}

	get(urlKey: string, id: string): T | null {
		return this.getEntriesForKey(urlKey).get(id) ?? null;
	}

	set(urlKey: string, id: string, value: T): void {
		this.getEntriesForKey(urlKey).set(id, value);
	}
}
