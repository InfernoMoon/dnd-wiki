/**
 * subclass.ts
 * Markdown code block processor for ```dnd-classinfo blocks.
 * Parses `class:`, one-or-more `subinfo:` directives, and optional repeated `section:` directives.
 * Fetches /{class}:{subinfo} and optionally renders only matching header sections.
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

function normalizeHeaderText(value: string): string {
  return value.replace(/\s+/g, '').trim().toLowerCase();
}

function extractSectionsFromHtml(contentHtml: string, sectionQueries: string[]): Array<{ title: string; html: string }> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="section-root">${contentHtml}</div>`, 'text/html');
  const root = doc.querySelector('#section-root');
  if (!root) return [];

  const headers = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6')) as HTMLElement[];
  if (!headers.length) return [];

  const results: Array<{ title: string; html: string }> = [];
  for (const query of sectionQueries) {
    const normalizedQuery = normalizeHeaderText(query);
    if (!normalizedQuery) continue;

    const headerIndex = headers.findIndex((h) => normalizeHeaderText(h.textContent || '') === normalizedQuery);
    if (headerIndex === -1) continue;

    const header = headers[headerIndex];
    const currentTag = header.tagName.toUpperCase();
    let nextSameLevelHeader: HTMLElement | null = null;
    for (let i = headerIndex + 1; i < headers.length; i++) {
      if (headers[i].tagName.toUpperCase() === currentTag) {
        nextSameLevelHeader = headers[i];
        break;
      }
    }

    const range = doc.createRange();
    range.setStartAfter(header);
    if (nextSameLevelHeader) {
      range.setEndBefore(nextSameLevelHeader);
    } else if (root.lastChild) {
      range.setEndAfter(root.lastChild);
    } else {
      range.setEndAfter(header);
    }

    const frag = range.cloneContents();
    const wrapper = doc.createElement('div');
    wrapper.appendChild(frag);

    const sectionTitle = (header.textContent || '').trim() || query.trim();
    results.push({ title: sectionTitle, html: wrapper.innerHTML });
  }

  return results;
}

function renderWithSections(
  host: HTMLElement,
  fallbackTitle: string,
  contentHtml: string,
  sectionQueries: string[],
  missingSectionsMessagePrefix: string
): void {
  if (!sectionQueries.length) {
    renderCollapsible(host, fallbackTitle, contentHtml);
    return;
  }

  const sections = extractSectionsFromHtml(contentHtml, sectionQueries);
  if (!sections.length) {
    host.textContent = `${missingSectionsMessagePrefix}: ${sectionQueries.join(', ')}`;
    return;
  }

  for (const section of sections) {
    const sectionHost = document.createElement('div');
    host.appendChild(sectionHost);
    renderCollapsible(sectionHost, section.title, section.html);
  }
}

export async function renderSubclass(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext | undefined, urlKey: string, baseUrl: string) {
  el.empty();
  if (!baseUrl) { el.createEl('div', { text: 'Base URL is not configured.' }); return; }

  const classMatch = /^class:\s*(.+)$/im.exec(source);
  const subinfoMatches = Array.from(source.matchAll(/^subinfo:\s*(.+)$/gim));
  const sectionMatches = Array.from(source.matchAll(/^section:\s*(.+)$/gim));

  if (!classMatch) { el.createEl('div', { text: 'Provide a `class:` directive.' }); return; }
  if (!subinfoMatches.length) { el.createEl('div', { text: 'Provide one or more `subinfo:` directives.' }); return; }

  const classSlug = nameToSlug(classMatch[1].trim());
  const classDirectiveOffset = classMatch.index ?? Number.MAX_SAFE_INTEGER;
  const rawSubinfos = subinfoMatches
    .filter(m => (m.index ?? Number.MAX_SAFE_INTEGER) > classDirectiveOffset)
    .map(m => (m[1] || '').trim())
    .filter(Boolean);
  const sectionQueries = sectionMatches
    .filter(m => (m.index ?? Number.MAX_SAFE_INTEGER) > classDirectiveOffset)
    .map(m => (m[1] || '').trim())
    .filter(Boolean);

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
      sectionQueries,
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
      sectionQueries,
      `No matching sections found in ${displayNameFromSlug(classSlug)} / ${displayNameFromSlug(subinfoSlug)}`
    );
    await preloadSubclassIds(urlKey, baseUrl, classSlug, subinfoSlug);
  } else {
    host.textContent = `Failed to load subclass: ${displayNameFromSlug(classSlug)} / ${displayNameFromSlug(subinfoSlug)}`;
  }
}
