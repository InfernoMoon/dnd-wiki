import { IdCache } from '../../cache/idCache';
import { RenderCache } from '../../cache/renderCache';
import type { CachedRender } from '../../cache/renderCache';
import { fetchPageContent } from '../../utils/fetcher';
import { loadFromLinks, loadFromTable, LoaderConfig } from '../../genericLoader';

export const lineageIdCache = new IdCache();
const lineageRenderCache = new RenderCache();

function cleanLineageTitle(title: string): string {
	return title.replace(/^Lineage:\s*/i, '');
}

export async function ensureLineageCached(
	lineageId: string,
	urlKey: string,
	baseUrl: string,
): Promise<CachedRender | null> {
	const existing = lineageRenderCache.get(urlKey, lineageId);
	if (existing) return existing;

	const lineagePageType = baseUrl.includes('2024') ? 'species' : 'lineage';
	const fetched = await fetchPageContent(baseUrl, lineagePageType, lineageId);
	if (!fetched.ok) return null;

	const cached: CachedRender = {
		title: cleanLineageTitle(fetched.titleText || lineageId),
		html: fetched.contentHtml,
	};
	lineageRenderCache.set(urlKey, lineageId, cached);
	return cached;
}

export async function preloadAllLineageIds(urlKey: string, baseUrl: string): Promise<void> {
	const is2024 = baseUrl.includes('2024');

	if (is2024) {
		const tableConfig: Omit<LoaderConfig, 'indexPath'> = {
			baseUrl,
			tableRowSelector: 'table tr',
			tableCellSelector: 'td',
			replacePatterns: [['Lineage: ', ''], ['Species: ', ''], ['(ua)', ''], ['(UA)', '']],
		};
		const [lineageIds, speciesIds] = await Promise.all([
			loadFromTable({ ...tableConfig, indexPath: '/lineage' }),
			loadFromTable({ ...tableConfig, indexPath: '/species:all' }),
		]);
		lineageIdCache.addMany(urlKey, lineageIds);
		lineageIdCache.addMany(urlKey, speciesIds);
		return;
	}

	const config: LoaderConfig = {
		baseUrl,
		indexPath: '/lineage',
		linkPattern: /^\/lineage:([^\s"'>]+)$/i,
		tableRowSelector: 'table tr',
		tableCellSelector: 'td',
	};
	const lineageIds = await loadFromLinks(config);
	lineageIdCache.addMany(urlKey, lineageIds);
}
