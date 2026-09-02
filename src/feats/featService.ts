import { fetchPageContent } from '../utils/fetcher';
import { loadFromLinks, loadFromTable, LoaderConfig } from '../genericLoader';

interface CachedFeat {
	title: string;
	html: string;
}

// In-memory set of known feat IDs per URL key.
const featIdCache: Map<string, Set<string>> = new Map();

// In-memory cache for rendered feat content, keyed by URL key and feat ID.
const featRenderCache: Map<string, Map<string, CachedFeat>> = new Map();

function getRenderCacheForKey(urlKey: string): Map<string, CachedFeat> {
	const existing = featRenderCache.get(urlKey);
	if (existing) return existing;
	const cache = new Map<string, CachedFeat>();
	featRenderCache.set(urlKey, cache);
	return cache;
}

/** Get a cached rendered feat by URL key and ID. */
export function getCachedFeat(urlKey: string, id: string): CachedFeat | null {
	return getRenderCacheForKey(urlKey).get(id) ?? null;
}

/** Store rendered feat content in the cache. */
export function setCachedFeat(urlKey: string, id: string, data: CachedFeat): void {
	getRenderCacheForKey(urlKey).set(id, data);
}

/** Get known feat IDs for a specific URL key. */
export function getKnownFeatIdsForKey(urlKey: string): string[] {
	return Array.from(featIdCache.get(urlKey) ?? []).sort((a, b) => a.localeCompare(b));
}

/** Ensure a feat is present in the cache by fetching it when necessary. */
export async function ensureFeatCached(
	featId: string,
	urlKey: string,
	baseUrl: string,
): Promise<CachedFeat | null> {
	const existing = getCachedFeat(urlKey, featId);
	if (existing) return existing;

	const fetched = await fetchPageContent(baseUrl, 'feat', featId);
	if (!fetched.ok) return null;

	const cached: CachedFeat = {
		title: fetched.titleText || featId,
		html: fetched.contentHtml,
	};
	setCachedFeat(urlKey, featId, cached);
	return cached;
}

/** Preload feat IDs for a URL key. */
export async function preloadAllFeatIds(urlKey: string, baseUrl: string): Promise<void> {
	let cache = featIdCache.get(urlKey);
	if (!cache) {
		cache = new Set();
		featIdCache.set(urlKey, cache);
	}

	const config: LoaderConfig = {
		baseUrl,
		indexPath: '/feats',
		linkPattern: /^\/feat:([^\s"'>]+)$/i,
		tableRowSelector: 'table tr',
		tableCellSelector: 'td',
		replacePatterns: [['(ua)', ''], ['(UA)', '']],
		filterFn: (name: string) => !name.includes('Alltoc'),
	};

	const is2024 = baseUrl.includes('2024');
	const featIds = is2024
		? await loadFromTable(config)
		: await loadFromLinks(config);
	for (const id of featIds) cache.add(id);
}
