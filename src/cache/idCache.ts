/** In-memory cache for IDs grouped by source URL. */
export class IdCache {
	private readonly entries = new Map<string, Set<string>>();

	private getEntriesForKey(urlKey: string): Set<string> {
		const existing = this.entries.get(urlKey);
		if (existing) return existing;

		const created = new Set<string>();
		this.entries.set(urlKey, created);
		return created;
	}

	get(urlKey: string): string[] {
		return Array.from(this.getEntriesForKey(urlKey)).sort((a, b) => a.localeCompare(b));
	}

	addMany(urlKey: string, ids: Iterable<string>): void {
		const entries = this.getEntriesForKey(urlKey);
		for (const id of ids) entries.add(id);
	}
}

/** In-memory cache for IDs grouped by a URL and a second scope. */
export class GroupedIdCache {
	private readonly entries = new Map<string, Map<string, string[]>>();

	private getEntriesForUrl(urlKey: string): Map<string, string[]> {
		const existing = this.entries.get(urlKey);
		if (existing) return existing;

		const created = new Map<string, string[]>();
		this.entries.set(urlKey, created);
		return created;
	}

	get(urlKey: string, groupKey: string): string[] {
		return this.getEntriesForUrl(urlKey).get(groupKey) ?? [];
	}

	has(urlKey: string, groupKey: string): boolean {
		return this.getEntriesForUrl(urlKey).has(groupKey);
	}

	set(urlKey: string, groupKey: string, ids: string[]): void {
		this.getEntriesForUrl(urlKey).set(groupKey, ids);
	}
}

/** Wait for cached IDs to become available, or return after the timeout. */
export async function waitForCachedIds(
	getIds: () => string[],
	timeoutMs = 30_000,
	intervalMs = 1_000,
): Promise<string[]> {
	const timeoutAt = Date.now() + timeoutMs;

	while (Date.now() < timeoutAt) {
		const ids = getIds();
		if (ids.length) return ids;

		await new Promise<void>(resolve => {
			window.setTimeout(resolve, intervalMs);
		});
	}

	return getIds();
}
