import type { MarkdownPostProcessorContext } from 'obsidian';
import { renderSingleSpell } from './spellUtils';
import { prepareNameInput } from '../../utils/renderer';

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
    await renderSingleSpell(host, urlKey, baseUrl, name);
  }
}
