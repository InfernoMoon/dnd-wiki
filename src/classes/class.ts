/**
 * class.ts
 * Markdown code block processor for ```dnd-class blocks.
 * Fetches the class page at /{classname} and renders it as a collapsible card.
 */
import type { MarkdownPostProcessorContext } from 'obsidian';
import { nameToSlug, fetchPageAtUrl, renderCollapsible, displayNameFromSlug } from '../utils';

// Cache: outer key = urlKey, inner key = class slug
const classCache = new Map<string, Map<string, { title: string; html: string }>>();

function getCacheForKey(urlKey: string): Map<string, { title: string; html: string }> {
  const existing = classCache.get(urlKey);
  if (existing) return existing;
  const cache = new Map<string, { title: string; html: string }>();
  classCache.set(urlKey, cache);
  return cache;
}

export function getCachedClass(urlKey: string, id: string): { title: string; html: string } | null {
  return getCacheForKey(urlKey).get(id) ?? null;
}

export function setCachedClass(urlKey: string, id: string, data: { title: string; html: string }): void {
  getCacheForKey(urlKey).set(id, data);
}

export async function renderClass(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext | undefined, urlKey: string, baseUrl: string) {
  el.empty();
  if (!baseUrl) { el.createDiv({ text: 'Base URL is not configured.' }); return; }
  const lines = source.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) { el.createDiv({ text: 'Provide one or more class names.' }); return; }

  const base = baseUrl.replace(/\/$/, '');
  const container = el.createDiv();

  for (const line of lines) {
    const id = nameToSlug(line);
    if (!id) continue;
    const host = container.createDiv();

    const cached = getCachedClass(urlKey, id);
    if (cached?.html) { renderCollapsible(host, cached.title, cached.html); continue; }

    const path = baseUrl.includes('2024') ? `${base}/${id}:main` : `${base}/${id}`;
    const res = await fetchPageAtUrl(path);
    if (res.ok) {
      const title = res.titleText || displayNameFromSlug(id);
      setCachedClass(urlKey, id, { title, html: res.contentHtml });
      renderCollapsible(host, title, res.contentHtml);
    } else {
      host.textContent = `Failed to load class: ${displayNameFromSlug(id)}`;
    }
  }
}
