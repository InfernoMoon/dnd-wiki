/**
 * subclass.ts
 * Markdown code block processor for ```dnd-subclass blocks.
 * Parses `class:` and `subclass:` directives and fetches /{class}:{subclass}.
 */
import type { MarkdownPostProcessorContext } from 'obsidian';
import { nameToSlug, fetchPageAtUrl, renderCollapsible, displayNameFromSlug } from '../utils';
import { preloadSubclassIds } from './subclassUtils';

// Cache: outer key = urlKey, inner key = "classSlug:subclassSlug"
const subclassRenderCache = new Map<string, Map<string, { title: string; html: string }>>();

function getCacheForKey(urlKey: string): Map<string, { title: string; html: string }> {
  if (!subclassRenderCache.has(urlKey)) subclassRenderCache.set(urlKey, new Map());
  return subclassRenderCache.get(urlKey)!;
}

export async function renderSubclass(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext | undefined, urlKey: string, baseUrl: string) {
  el.empty();
  if (!baseUrl) { el.createEl('div', { text: 'Base URL is not configured.' }); return; }

  const classMatch = /^class:\s*(.+)$/im.exec(source);
  const subclassMatch = /^subclass:\s*(.+)$/im.exec(source);

  if (!classMatch) { el.createEl('div', { text: 'Provide a `class:` directive.' }); return; }
  if (!subclassMatch) { el.createEl('div', { text: 'Provide a `subclass:` directive.' }); return; }

  const classSlug = nameToSlug(classMatch[1].trim());
  const subclassSlug = nameToSlug(subclassMatch[1].trim());

  if (!classSlug || !subclassSlug) { el.createEl('div', { text: 'Invalid class or subclass name.' }); return; }

  const cacheKey = `${classSlug}:${subclassSlug}`;
  const cache = getCacheForKey(urlKey);
  const cached = cache.get(cacheKey);
  if (cached) { renderCollapsible(el, cached.title, cached.html); return; }

  const base = baseUrl.replace(/\/$/, '');
  const url = `${base}/${classSlug}:${subclassSlug}`;
  const res = await fetchPageAtUrl(url);

  if (res.ok) {
    const title = res.titleText || `${displayNameFromSlug(classSlug)}: ${displayNameFromSlug(subclassSlug)}`;
    cache.set(cacheKey, { title, html: res.contentHtml });
    renderCollapsible(el, title, res.contentHtml);
    // Seed subclass IDs for this class while we have the class page cached
    await preloadSubclassIds(urlKey, baseUrl, classSlug);
  } else {
    el.createEl('div', { text: `Failed to load subclass: ${displayNameFromSlug(classSlug)} / ${displayNameFromSlug(subclassSlug)}` });
  }
}
