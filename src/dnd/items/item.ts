import type { MarkdownPostProcessorContext } from 'obsidian';
import { ensureItemCached } from './itemService';
import { nameToSlug, displayNameFromSlug } from '../../utils/text';
import { prepareNameInput, renderCollapsible } from '../../utils/renderer';

export async function renderItem(
	source: string,
	el: HTMLElement,
	_ctx: MarkdownPostProcessorContext | undefined,
	urlKey: string,
	baseUrl: string,
): Promise<void> {
	const lines = prepareNameInput(el, source, baseUrl, 'Provide one or more item names or IDs.');
	if (!lines) return;

	const container = el.createDiv();
	for (const itemId of lines.map(line => nameToSlug(line)).filter(Boolean)) {
		const host = container.createDiv('dnd-wiki-card-spacer');
		const cached = await ensureItemCached(itemId, urlKey, baseUrl);

		if (cached?.html) {
			renderCollapsible(host, cached.title, cached.html);
		} else {
			host.textContent = `Failed to load item: ${displayNameFromSlug(itemId)}`;
		}
	}
}
