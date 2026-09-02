import type { MarkdownPostProcessorContext } from 'obsidian';
import { nameToSlug } from '../../utils/text';
import { prepareNameInput, renderCollapsible } from '../../utils/renderer';
import { ensureBackgroundCached } from './backgroundService';

export async function renderBackground(
	source: string,
	el: HTMLElement,
	_ctx: MarkdownPostProcessorContext | undefined,
	urlKey: string,
	baseUrl: string,
): Promise<void> {
	const lines = prepareNameInput(el, source, baseUrl, 'Provide one or more background IDs or names.');
	if (!lines) return;

	const container = el.createDiv();
	for (const backgroundId of lines.map(line => nameToSlug(line)).filter(Boolean)) {
		const cached = await ensureBackgroundCached(backgroundId, urlKey, baseUrl);
		if (cached?.html) {
			const host = container.createDiv();
			renderCollapsible(host, cached.title, cached.html);
		} else {
			const error = container.createDiv();
			error.textContent = `Failed to load background: ${backgroundId}`;
		}
	}
}
