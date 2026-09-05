import { IdCache } from '../../cache/idCache';
import { RenderCache } from '../../cache/renderCache';
import type { CachedRender } from '../../cache/renderCache';
import { fetchPageContentWithSlugFallbacks, is2024Source } from '../../utils/wikiPageFetcher';
import { nameToSlugs } from '../../utils/text';
import { loadFromLinks, loadFromTable, LoaderConfig } from '../../utils/wikiIndexLoader';
import {
	getCachedHomebrewLineageIds,
	getSimpleCachedHomebrewContent,
	homebrewLineagePaths,
	homebrewLineages,
} from '../../homebrew/homebrewService';

export const lineageIdCache = new IdCache();
const lineageRenderCache = new RenderCache<CachedRender>();

function cleanLineageTitle(title: string): string {
	return title.replace(/^Lineage:\s*/i, '');
}

export async function ensureLineageCached(
	lineageName: string,
	urlKey: string,
	baseUrl: string,
): Promise<CachedRender | null> {
	const lineageIds = nameToSlugs(lineageName);
	if (!lineageIds.length) return null;
	for (const lineageId of lineageIds) {
		const existing = lineageRenderCache.get(urlKey, lineageId);
		if (existing) return existing;
	}
	const homebrew = await getSimpleCachedHomebrewContent(lineageName, homebrewLineages, homebrewLineagePaths);
	if (homebrew) {
		lineageIdCache.addMany(urlKey, lineageIds);
		for (const lineageId of lineageIds) lineageRenderCache.set(urlKey, lineageId, homebrew);
		return homebrew;
	}

	const lineagePageType = is2024Source(baseUrl) ? 'species' : 'lineage';
	const fetched = await fetchPageContentWithSlugFallbacks(baseUrl, lineagePageType, lineageName);
	if (!fetched.ok) return null;

	const cached: CachedRender = {
		title: cleanLineageTitle(fetched.titleText || lineageName),
		html: fetched.contentHtml,
	};
	for (const lineageId of lineageIds) lineageRenderCache.set(urlKey, lineageId, cached);
	return cached;
}

export async function preloadAllLineageIds(urlKey: string, baseUrl: string): Promise<void> {
	lineageIdCache.addMany(urlKey, getCachedHomebrewLineageIds());
	const is2024 = is2024Source(baseUrl);

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
