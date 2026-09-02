import type { MarkdownPostProcessorContext } from 'obsidian';
import { getPrimarySlug } from '../../utils/text';
import { prepareNameInput, renderCollapsible } from '../../utils/renderer';
import { ensureLineageCached } from './lineageService';

export async function renderLineage(
	source: string,
	el: HTMLElement,
	_ctx: MarkdownPostProcessorContext | undefined,
	urlKey: string,
	baseUrl: string,
): Promise<void> {
	const lines = prepareNameInput(el, source, baseUrl, 'Provide one or more lineage IDs or names.');
	if (!lines) return;

	const container = el.createDiv();
	for (const lineageName of lines) {
		const lineageId = getPrimarySlug(lineageName);
		if (!lineageId) continue;
		const cached = await ensureLineageCached(lineageName, urlKey, baseUrl);
		if (cached?.html) {
			const host = container.createDiv();
			renderCollapsible(host, cached.title, cached.html);
		} else {
			const error = container.createDiv();
			error.textContent = `Failed to load lineage: ${lineageId}`;
		}
	}
}
