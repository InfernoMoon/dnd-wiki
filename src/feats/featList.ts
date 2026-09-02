
import type { MarkdownPostProcessorContext } from 'obsidian';
import { waitForCachedIds } from '../cache/idCache';
import { ensureFeatCached, featIdCache } from './featService';
import { displayNameFromSlug } from '../utils/text';
import { matchesSearch, parseSearchDirective, parseSearchModeDirective } from '../utils/search';
import type { SearchMode } from '../utils/search';
import { renderCollapsible } from '../utils/renderer';

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

			if (!matchesSearch(feat, searches, searchMode)) {
				host.classList.add('dnd-wiki-search-hidden');
			}
		} else {
			host.textContent = `Failed to load feat: ${displayNameFromSlug(id)}`;
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
	const ids = await waitForCachedIds(() => featIdCache.get(urlKey));

	if (!ids.length) {
		status.setText('No feats found after 30 seconds. Please reload the plugin.');
		return;
	}

	el.empty();
	const container = el.createDiv();
	await renderFeatCards(ids, container, urlKey, baseUrl, searches, searchMode);
}
