
import type { MarkdownPostProcessorContext } from 'obsidian';
import { ensureFeatCached, getKnownFeatIdsForKey } from './featService';
import { displayNameFromSlug } from '../utils/text';
import { parseSearchDirective, parseSearchModeDirective } from '../utils/search';
import { renderCollapsible } from '../utils/renderer';

type SearchMode = 'and' | 'or';

/** Wait for startup preloading to populate the IDs, or stop after 30 seconds. */
async function waitForFeatIds(urlKey: string): Promise<string[]> {
	const timeoutAt = Date.now() + 30_000;

	while (Date.now() < timeoutAt) {
		const ids = getKnownFeatIdsForKey(urlKey);
		if (ids.length) return ids;

		await new Promise<void>((resolve) => {
			window.setTimeout(resolve, 1000);
		});
	}

	return getKnownFeatIdsForKey(urlKey);
}

function matchesSearch(host: HTMLElement, searches: string[], searchMode: SearchMode): boolean {
	if (!searches.length) return true;

	const text = host.textContent?.toLowerCase() ?? '';
	return searchMode === 'and'
		? searches.every((search) => text.includes(search))
		: searches.some((search) => text.includes(search));
}

async function renderFeatCards(
	ids: string[],
	container: HTMLElement,
	urlKey: string,
	baseUrl: string,
	searches: string[],
	searchMode: SearchMode,
): Promise<void> {
	await Promise.all(ids.map(async (id) => {
		const host = container.createDiv();
		const feat = await ensureFeatCached(id, urlKey, baseUrl);

		if (feat?.html) {
			renderCollapsible(host, feat.title, feat.html);
		} else {
			host.textContent = `Failed to load feat: ${displayNameFromSlug(id)}`;
		}

		if (!matchesSearch(host, searches, searchMode)) {
			host.classList.add('dnd-wiki-search-hidden');
		}
	}));
}

export async function renderFeatList(
	source: string,
	el: HTMLElement,
	_ctx: MarkdownPostProcessorContext | undefined,
	urlKey: string,
	baseUrl: string,
): Promise<void> {
	el.empty();
	if (!baseUrl) {
		el.createDiv({ text: 'Base URL is not configured.' });
		return;
	}

	const searches = parseSearchDirective(source);
	const searchMode = parseSearchModeDirective(source);
	const status = el.createDiv({ text: 'Waiting for feat data…' });
	const ids = await waitForFeatIds(urlKey);

	if (!ids.length) {
		status.setText('No feats found after 30 seconds. Please reload the plugin.');
		return;
	}

	el.empty();
	const container = el.createDiv();
	await renderFeatCards(ids, container, urlKey, baseUrl, searches, searchMode);
}
