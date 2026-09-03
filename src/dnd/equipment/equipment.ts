import type { MarkdownPostProcessorContext } from 'obsidian';
import { ensureEquipmentCached } from './equipmentService';
import { prepareNameInput, renderCollapsible, renderNoResultsMessage } from '../../utils/renderer';
import { displayNameFromSlug, getPrimarySlug } from '../../utils/text';

export async function renderEquipment(
	source: string,
	el: HTMLElement,
	_ctx: MarkdownPostProcessorContext | undefined,
	urlKey: string,
	baseUrl: string,
): Promise<void> {
	const names = prepareNameInput(el, source, baseUrl, 'Provide one or more equipment names.');
	if (!names) return;

	const container = el.createDiv();
	let renderedCount = 0;
	for (const name of names) {
		const host = container.createDiv('dnd-wiki-card-spacer');
		const cached = await ensureEquipmentCached(name, urlKey, baseUrl);
		if (!cached) {
			host.textContent = `Failed to load equipment: ${displayNameFromSlug(getPrimarySlug(name))}`;
			continue;
		}

		renderedCount++;
		renderCollapsible(host, cached.title, cached.html);
	}

	if (!renderedCount) renderNoResultsMessage(container, 'equipment');
}
