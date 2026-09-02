export interface CachedRender {
	title: string;
	html: string;
}

/** In-memory cache for rendered entries grouped by source URL. */
export class RenderCache {
	private readonly entries = new Map<string, Map<string, CachedRender>>();

	private getEntriesForKey(urlKey: string): Map<string, CachedRender> {
		const existing = this.entries.get(urlKey);
		if (existing) return existing;

		const created = new Map<string, CachedRender>();
		this.entries.set(urlKey, created);
		return created;
	}

	get(urlKey: string, id: string): CachedRender | null {
		return this.getEntriesForKey(urlKey).get(id) ?? null;
	}

	set(urlKey: string, id: string, value: CachedRender): void {
		this.getEntriesForKey(urlKey).set(id, value);
	}
}
