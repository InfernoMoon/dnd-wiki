import type { MarkdownPostProcessorContext } from 'obsidian';
import { nameToSlug } from '../utils/text';
import { prepareNameInput, renderCollapsible } from '../utils/renderer';
import { ensureFeatCached } from './featService';

export async function renderFeat(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext | undefined, urlKey: string, baseUrl: string) {
  const lines = prepareNameInput(el, source, baseUrl, 'Provide one or more feat IDs or names.');
  if (!lines) return;

  const feats = lines.map(l => nameToSlug(l)).filter(Boolean);
  const container = el.createDiv();

  for (const featId of feats) {
    const cached = await ensureFeatCached(featId, urlKey, baseUrl);
    if (cached?.html) {
      const host = container.createDiv();
      renderCollapsible(host, cached.title, cached.html);
    } else {
      const err = container.createDiv();
      err.textContent = `Failed to load feat: ${featId}`;
      container.appendChild(err);
    }
  }
}
