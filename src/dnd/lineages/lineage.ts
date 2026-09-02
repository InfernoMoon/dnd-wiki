import type { MarkdownPostProcessorContext } from 'obsidian';
import { nameToSlug } from '../../utils/text';
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
	for (const lineageId of lines.map(line => nameToSlug(line)).filter(Boolean)) {
		const cached = await ensureLineageCached(lineageId, urlKey, baseUrl);
		if (cached?.html) {
			const host = container.createDiv();
			renderCollapsible(host, cached.title, cached.html);
		} else {
			const error = container.createDiv();
			error.textContent = `Failed to load lineage: ${lineageId}`;
		}
	}
}
