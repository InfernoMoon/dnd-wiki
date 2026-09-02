import type { MarkdownPostProcessorContext } from 'obsidian';
import { waitForCachedIds } from '../../cache/idCache';
import { ensureBackgroundCached, backgroundIdCache } from './backgroundService';
import { displayNameFromSlug } from '../../utils/text';
import { matchesSearch, parseSearchDirective, parseSearchModeDirective } from '../../utils/search';
import type { SearchMode } from '../../utils/search';
import { renderCollapsible, renderNoResultsMessage, requireBaseUrl } from '../../utils/renderer';

async function renderBackgroundCards(
	ids: string[],
	container: HTMLElement,
	urlKey: string,
	baseUrl: string,
	searches: string[],
	searchMode: SearchMode,
	): Promise<number> {
	let visibleCount = 0;
	await Promise.all(ids.map(async id => {
		const host = container.createDiv();
		const background = await ensureBackgroundCached(id, urlKey, baseUrl);

		if (background?.html) {
			renderCollapsible(host, background.title, background.html);
			if (!matchesSearch(background, searches, searchMode)) {
				host.classList.add('dnd-wiki-search-hidden');
			} else {
				visibleCount++;
			}
		} else {
			host.textContent = `Failed to load background: ${displayNameFromSlug(id)}`;
		}
	}));
	return visibleCount;
}

export async function renderBackgroundList(
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
	const status = el.createDiv({ text: 'Waiting for background data…' });
	const ids = await waitForCachedIds(() => backgroundIdCache.get(urlKey));

	if (!ids.length) {
		status.setText('No backgrounds found after 30 seconds. Please reload the plugin.');
		return;
	}

	el.empty();
	const container = el.createDiv();
	const visibleCount = await renderBackgroundCards(ids, container, urlKey, baseUrl, searches, searchMode);
	if (!visibleCount) renderNoResultsMessage(container, 'backgrounds');
}
