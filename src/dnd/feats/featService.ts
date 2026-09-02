import { IdCache } from '../../cache/idCache';
import { RenderCache } from '../../cache/renderCache';
import type { CachedRender } from '../../cache/renderCache';
import { fetchPageContent } from '../../utils/fetcher';
import { loadFromLinks, loadFromTable, LoaderConfig } from '../../genericLoader';

// In-memory set of known feat IDs per URL key.
export const featIdCache = new IdCache();

// In-memory cache for rendered feat content, keyed by URL key and feat ID.
const featRenderCache = new RenderCache();

/** Ensure a feat is present in the cache by fetching it when necessary. */
export async function ensureFeatCached(
	featId: string,
	urlKey: string,
	baseUrl: string,
): Promise<CachedRender | null> {
	const existing = featRenderCache.get(urlKey, featId);
	if (existing) return existing;

	const fetched = await fetchPageContent(baseUrl, 'feat', featId);
	if (!fetched.ok) return null;

	const cached: CachedRender = {
		title: fetched.titleText || featId,
		html: fetched.contentHtml,
	};
	featRenderCache.set(urlKey, featId, cached);
	return cached;
}

/** Preload feat IDs for a URL key. */
export async function preloadAllFeatIds(urlKey: string, baseUrl: string): Promise<void> {
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
	featIdCache.addMany(urlKey, featIds);
}
