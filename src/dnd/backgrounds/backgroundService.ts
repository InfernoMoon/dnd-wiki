import { IdCache } from '../../cache/idCache';
import { RenderCache } from '../../cache/renderCache';
import type { CachedRender } from '../../cache/renderCache';
import { fetchPageContentWithSlugFallbacks, is2024Source } from '../../utils/wikiPageFetcher';
import { nameToSlugs } from '../../utils/text';
import { loadFromLinks, loadFromTable, LoaderConfig } from '../../utils/wikiIndexLoader';

export const backgroundIdCache = new IdCache();
const backgroundRenderCache = new RenderCache<CachedRender>();

function cleanBackgroundTitle(title: string): string {
	return title.replace(/^Background:\s*/i, '');
}

export async function ensureBackgroundCached(
	backgroundName: string,
	urlKey: string,
	baseUrl: string,
): Promise<CachedRender | null> {
	const backgroundIds = nameToSlugs(backgroundName);
	if (!backgroundIds.length) return null;
	for (const backgroundId of backgroundIds) {
		const existing = backgroundRenderCache.get(urlKey, backgroundId);
		if (existing) return existing;
	}

	const fetched = await fetchPageContentWithSlugFallbacks(baseUrl, 'background', backgroundName);
	if (!fetched.ok) return null;

	const cached: CachedRender = {
		title: cleanBackgroundTitle(fetched.titleText || backgroundName),
		html: fetched.contentHtml,
	};
	for (const backgroundId of backgroundIds) backgroundRenderCache.set(urlKey, backgroundId, cached);
	return cached;
}

export async function preloadAllBackgroundIds(urlKey: string, baseUrl: string): Promise<void> {
	const config: LoaderConfig = {
		baseUrl,
		indexPath: '/backgrounds',
		linkPattern: /^\/background:([^\s"'>]+)$/i,
		tableRowSelector: 'table tr',
		tableCellSelector: 'td',
		replacePatterns: [['Background: ', ''], ['(ua)', ''], ['(UA)', '']],
		filterFn: (name: string) => !name.toLowerCase().endsWith('toc1'),
	};

	const backgroundIds = is2024Source(baseUrl)
		? await loadFromTable(config)
		: await loadFromLinks(config);
	backgroundIdCache.addMany(urlKey, backgroundIds);
}
