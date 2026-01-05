import type { MarkdownPostProcessorContext } from 'obsidian';
import { getBaseUrl } from './dataService';
import { nameToSlug, fetchPageContent, renderCollapsible, displayNameFromSlug } from './utils';

// Simple cache for fetched item content
const itemCache = new Map<string, { title: string; html: string }>();

export function getCachedItem(id: string): { title: string; html: string } | null {
  return itemCache.get(id) || null;
}

export function setCachedItem(id: string, data: { title: string; html: string }): void {
  itemCache.set(id, data);
}

function renderItemCard(container: HTMLElement, title: string, html: string) {
  const host = document.createElement('div');
  host.style.marginBottom = '0.75em';
  container.appendChild(host);
  renderCollapsible(host, title, html);
}

// Markdown code block processor for ```dnd-item blocks.
export async function renderItem(source: string, el: HTMLElement, _ctx?: MarkdownPostProcessorContext) {
  el.empty();
  const baseUrl = await getBaseUrl();
  if (!baseUrl) {
    el.createEl('div', { text: 'Base URL is not configured.' });
    return;
  }

  const lines = source.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) {
    el.createEl('div', { text: 'Provide one or more item names or IDs.' });
    return;
  }

  const ids = lines.map(l => nameToSlug(l)).filter(Boolean);
  const container = document.createElement('div');
  el.appendChild(container);

  for (const id of ids) {
    let cached = itemCache.get(id) || null;
    if (!cached) {
      const res = await fetchPageContent(baseUrl, 'wondrous-items', id);
      if (res.ok) {
        const title = res.titleText || displayNameFromSlug(id);
        cached = { title, html: res.contentHtml };
        itemCache.set(id, cached);
      }
    }
    if (cached?.html) {
      renderItemCard(container, cached.title, cached.html);
    } else {
      const err = document.createElement('div');
      err.textContent = `Failed to load item: ${displayNameFromSlug(id)}`;
      container.appendChild(err);
    }
  }
}
