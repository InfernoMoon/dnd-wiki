import type { MarkdownPostProcessorContext } from 'obsidian';
import { getBaseUrl } from './dataService';
import { nameToSlug, fetchPageContent, renderCollapsible } from './utils';

// In-memory cache for fetched feat content by id/slug
const featCache = new Map<string, { title: string; html: string }>();

export function getCachedFeat(id: string): { title: string; html: string } | null {
  return featCache.get(id) || null;
}

export function setCachedFeat(id: string, data: { title: string; html: string }): void {
  featCache.set(id, data);
}

function renderFeatCard(container: HTMLElement, title: string, html: string) {
  const host = document.createElement('div');
  container.appendChild(host);
  renderCollapsible(host, title, html);
}

// Markdown code block processor for ```dnd-feat blocks.
export async function renderFeat(source: string, el: HTMLElement, _ctx?: MarkdownPostProcessorContext) {
  el.empty();
  const baseUrl = await getBaseUrl();
  if (!baseUrl) {
    el.createEl('div', { text: 'Base URL is not configured.' });
    return;
  }

  const lines = source.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) {
    el.createEl('div', { text: 'Provide one or more feat IDs or names.' });
    return;
  }

  const feats = lines.map(l => nameToSlug(l)).filter(Boolean);
  const container = document.createElement('div');
  el.appendChild(container);

  for (const featId of feats) {
    let cached = featCache.get(featId) || null;
    if (!cached) {
      const fetched = await fetchPageContent(baseUrl, 'feat', featId);
      if (fetched.ok) {
        cached = { title: fetched.titleText || featId, html: fetched.contentHtml };
        featCache.set(featId, cached);
      }
    }
    if (cached?.html) {
      renderFeatCard(container, cached.title, cached.html);
    } else {
      const err = document.createElement('div');
      err.textContent = `Failed to load feat: ${featId}`;
      container.appendChild(err);
    }
  }
}
