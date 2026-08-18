/**
 * subclass.ts
 * Markdown code block processor for ```dnd-classinfo blocks.
 * Parses `class:`, one-or-more `subinfo:` directives, and optional repeated `section:` directives.
 * Fetches /{class}:{subinfo} and optionally renders only matching header sections.
 */
import type { MarkdownPostProcessorContext } from 'obsidian';
import { nameToSlug, fetchPageAtUrl, displayNameFromSlug } from '../utils';
import { preloadSubclassIds } from './subclassUtils';
import { parseSectionDirectives, renderWithSections } from '../sectionRenderer';

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
  const subinfoMatches = Array.from(source.matchAll(/^subinfo:\s*(.+)$/gim));

  if (!classMatch) { el.createEl('div', { text: 'Provide a `class:` directive.' }); return; }
  if (!subinfoMatches.length) { el.createEl('div', { text: 'Provide one or more `subinfo:` directives.' }); return; }

  const classSlug = nameToSlug(classMatch[1].trim());
  const classDirectiveOffset = classMatch.index ?? Number.MAX_SAFE_INTEGER;
  const rawSubinfos = subinfoMatches
    .filter(m => (m.index ?? Number.MAX_SAFE_INTEGER) > classDirectiveOffset)
    .map(m => (m[1] || '').trim())
    .filter(Boolean);
  const sectionDirectives = parseSectionDirectives(source, classDirectiveOffset);

  if (!classSlug) { el.createEl('div', { text: 'Invalid class name.' }); return; }
  if (!rawSubinfos.length) { el.createEl('div', { text: 'Place `subinfo:` lines after `class:`.' }); return; }

  const subinfoSlugs = rawSubinfos
    .map(v => nameToSlug(v))
    .filter(Boolean);

  if (!subinfoSlugs.length) { el.createEl('div', { text: 'Invalid subinfo name(s).' }); return; }

  // If multiple subinfo lines are provided, render only the last one.
  const subinfoSlug = subinfoSlugs[subinfoSlugs.length - 1];

  const base = baseUrl.replace(/\/$/, '');
  const cache = getCacheForKey(urlKey);
  const host = document.createElement('div');
  el.appendChild(host);

  const cacheKey = `${classSlug}:${subinfoSlug}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    renderWithSections(
      host,
      cached.title,
      cached.html,
      sectionDirectives,
      `No matching sections found in ${displayNameFromSlug(classSlug)} / ${displayNameFromSlug(subinfoSlug)}`
    );
    await preloadSubclassIds(urlKey, baseUrl, classSlug, subinfoSlug);
    return;
  }

  const url = `${base}/${classSlug}:${subinfoSlug}`;
  const res = await fetchPageAtUrl(url);

  if (res.ok) {
    const title = res.titleText || `${displayNameFromSlug(classSlug)}: ${displayNameFromSlug(subinfoSlug)}`;
    cache.set(cacheKey, { title, html: res.contentHtml });
    renderWithSections(
      host,
      title,
      res.contentHtml,
      sectionDirectives,
      `No matching sections found in ${displayNameFromSlug(classSlug)} / ${displayNameFromSlug(subinfoSlug)}`
    );
    await preloadSubclassIds(urlKey, baseUrl, classSlug, subinfoSlug);
  } else {
    host.textContent = `Failed to load subclass: ${displayNameFromSlug(classSlug)} / ${displayNameFromSlug(subinfoSlug)}`;
  }
}
