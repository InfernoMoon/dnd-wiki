import { IdCache } from '../../cache/idCache';
import { RenderCache } from '../../cache/renderCache';
import type { CachedRender } from '../../cache/renderCache';
import { fetchPageContent } from '../../utils/fetcher';
import { loadFromLinks, loadFromTable, LoaderConfig } from '../../genericLoader';

export const backgroundIdCache = new IdCache();
const backgroundRenderCache = new RenderCache<CachedRender>();

function cleanBackgroundTitle(title: string): string {
	return title.replace(/^Background:\s*/i, '');
}

export async function ensureBackgroundCached(
	backgroundId: string,
	urlKey: string,
	baseUrl: string,
): Promise<CachedRender | null> {
	const existing = backgroundRenderCache.get(urlKey, backgroundId);
	if (existing) return existing;

	const fetched = await fetchPageContent(baseUrl, 'background', backgroundId);
	if (!fetched.ok) return null;

	const cached: CachedRender = {
		title: cleanBackgroundTitle(fetched.titleText || backgroundId),
		html: fetched.contentHtml,
	};
	backgroundRenderCache.set(urlKey, backgroundId, cached);
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

	const backgroundIds = baseUrl.includes('2024')
		? await loadFromTable(config)
		: await loadFromLinks(config);
	backgroundIdCache.addMany(urlKey, backgroundIds);
}
