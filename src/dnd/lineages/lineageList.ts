import type { MarkdownPostProcessorContext } from 'obsidian';
import { waitForCachedIds } from '../../cache/idCache';
import { ensureLineageCached, lineageIdCache } from './lineageService';
import { displayNameFromSlug } from '../../utils/text';
import { matchesSearch, parseSearchDirective, parseSearchModeDirective } from '../../utils/search';
import type { SearchMode } from '../../utils/search';
import { renderCollapsible, requireBaseUrl } from '../../utils/renderer';

async function renderLineageCards(
	ids: string[],
	container: HTMLElement,
	urlKey: string,
	baseUrl: string,
	searches: string[],
	searchMode: SearchMode,
): Promise<void> {
	await Promise.all(ids.map(async id => {
		const host = container.createDiv();
		const lineage = await ensureLineageCached(id, urlKey, baseUrl);

		if (lineage?.html) {
			renderCollapsible(host, lineage.title, lineage.html);
			if (!matchesSearch(lineage, searches, searchMode)) {
				host.classList.add('dnd-wiki-search-hidden');
			}
		} else {
			host.textContent = `Failed to load lineage: ${displayNameFromSlug(id)}`;
		}
	}));
}

export async function renderLineageList(
	source: string,
	el: HTMLElement,
	_ctx: MarkdownPostProcessorContext | undefined,
	urlKey: string,
	baseUrl: string,
): Promise<void> {
	el.empty();
	if (!requireBaseUrl(el, baseUrl)) return;

	const searches = parseSearchDirective(source);
	const searchMode = parseSearchModeDirective(source);
	const status = el.createDiv({ text: 'Waiting for lineage data…' });
	const ids = await waitForCachedIds(() => lineageIdCache.get(urlKey));

	if (!ids.length) {
		status.setText('No lineages found after 30 seconds. Please reload the plugin.');
		return;
	}

	el.empty();
	const container = el.createDiv();
	await renderLineageCards(ids, container, urlKey, baseUrl, searches, searchMode);
}
