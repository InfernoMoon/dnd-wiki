import type { MarkdownPostProcessorContext } from 'obsidian';
import { renderSingleSpell } from './spellUtils';
import { prepareNameInput, renderCollapsible } from '../../utils/renderer';
import { getCachedHomebrewSpellContent } from '../../homebrew/homebrewService';

export async function renderSpell(
  source: string,
  el: HTMLElement,
  _ctx: MarkdownPostProcessorContext | undefined,
  urlKey: string,
  baseUrl: string,
): Promise<void> {
  const lines = prepareNameInput(el, source, baseUrl, 'Provide one or more spell IDs or names.');
  if (!lines) return;

  const container = el.createDiv();
	for (const name of lines) {
		const host = container.createDiv('dnd-wiki-card-spacer');
		const homebrew = await getCachedHomebrewSpellContent(name);
		if (homebrew) {
			renderCollapsible(host, homebrew.title, homebrew.html);
			continue;
		}
		await renderSingleSpell(host, urlKey, baseUrl, name);
	}
}
