import { IdCache } from '../../cache/idCache';
import { RenderCache } from '../../cache/renderCache';
import type { CachedRender } from '../../cache/renderCache';
import { fetchPageContentWithSlugFallbacks } from '../../utils/fetcher';
import { nameToSlugs } from '../../utils/text';
import { loadFromLinks, loadFromTable, LoaderConfig } from '../../genericLoader';

export const featIdCache = new IdCache();
const featRenderCache = new RenderCache<CachedRender>();

export async function ensureFeatCached(
	featName: string,
	urlKey: string,
	baseUrl: string,
): Promise<CachedRender | null> {
	const featIds = nameToSlugs(featName);
	if (!featIds.length) return null;
	for (const featId of featIds) {
		const existing = featRenderCache.get(urlKey, featId);
		if (existing) return existing;
	}

	const fetched = await fetchPageContentWithSlugFallbacks(baseUrl, 'feat', featName);
	if (!fetched.ok) return null;

	const cached: CachedRender = {
		title: fetched.titleText || featName,
		html: fetched.contentHtml,
	};
	for (const featId of featIds) featRenderCache.set(urlKey, featId, cached);
	return cached;
}

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
