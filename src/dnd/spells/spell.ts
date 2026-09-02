/**
 * spell.ts
 * Markdown code block processor for ```dnd-spell blocks.
 * Renders one or more spell cards by delegating to `renderSingleSpell`.
 * Keeps the entrypoint minimal and focused on parsing input and layout.
 */
import type { MarkdownPostProcessorContext } from 'obsidian';
import { renderSingleSpell } from './spellUtils';
import { prepareNameInput } from '../../utils/renderer';

/**
 * Render one or more spells inside a ```dnd-spell code block.
 * - Splits the block content into lines (each a spell name)
 * - Validates Base URL from settings
 * - Creates a container and renders each spell as a collapsible card
 */
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
