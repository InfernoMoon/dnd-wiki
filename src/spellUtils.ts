/**
 * spellUtils.ts
 * Shared helpers for spell rendering and data preloading.
 * - Caches known spell IDs and rendered content
 * - Preloads names from `/spells` index
 * - Fetches spell pages and applies UA fallback
 * - Renders collapsible cards with sanitized content
 */
import { requestUrl } from "obsidian";
import { nameToSlug, displayNameFromSlug } from "./utils";

// In-memory cache of rendered spell content, keyed by normalized id
const spellRenderCache: Map<string, { titleText: string; contentHtml: string }> = new Map();
// In-memory set of all known spell names (normalized ids)
const spellNameCache: Set<string> = new Set();

/** Return all known spell IDs, sorted for suggesters */
export function getKnownSpellIds(): string[] {
  return Array.from(spellNameCache).sort((a, b) => a.localeCompare(b));
}

/** Preload spell names from `/spells` index page and fill `spellNameCache` */
export async function preloadAllSpellNames(baseUrl: string): Promise<void> {
  const base = baseUrl.replace(/\/$/, "");
  try {
    const res = await requestUrl({ url: `${base}/spells`, method: 'GET' });
    if (res.status < 200 || res.status >= 300) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(res.text, 'text/html');
    const rows = Array.from(doc.querySelectorAll('table tr'));
    const names = rows
      .map(tr => tr.querySelector('td'))
      .filter(td => td?.textContent?.trim().length)
      .map(td => (td?.textContent || '').trim())
      // Remove (UA) markers
      .map(n => n.split('(ua)').join('').split('(UA)').join('').trim());
    for (const n of names) {
      const id = nameToSlug(n);
      if (id) spellNameCache.add(id);
    }
  } catch (e) {
    console.error('Failed to preload spell names', e);
  }
}

/** Render a single spell card with caching and UA-aware fallback */
export async function renderSingleSpell(host: HTMLElement, baseUrl: string, name: string) {
  const id = nameToSlug(name);
  if (!id) {
    host.createEl('div', { text: 'No spell name provided' });
    return;
  }
  // If not known, check UA variant; otherwise report unknown without requesting
  let effectiveId = id;
  if (!spellNameCache.has(id)) {
    const uaId = `${id}-ua`;
    if (spellNameCache.has(uaId)) {
      effectiveId = uaId;
    } else {
      renderCollapsible(host, displayNameFromSlug(id) + ' (Error)', 'Spell unknown');
      return;
    }
  }
  // If already rendered and cached, reuse without refetching
  const cached = spellRenderCache.get(effectiveId);
  if (cached) {
    renderCollapsible(host, cached.titleText, cached.contentHtml);
    return;
  }
  try {
    const result = await fetchSpellPageWithFallback(baseUrl, effectiveId);
    if (!result.ok) {
      // If not present in render cache, treat as unknown and show error
      if (!spellRenderCache.has(effectiveId)) {
        renderCollapsible(host, displayNameFromSlug(effectiveId) + ' (Error)', 'Error loading this spell');
        return;
      }
      const cachedFallback = spellRenderCache.get(effectiveId);
      if (cachedFallback) {
        renderCollapsible(host, cachedFallback.titleText, cachedFallback.contentHtml);
      } else {
        renderCollapsible(host, displayNameFromSlug(effectiveId) + ' (Error)', 'Error loading this spell');
      }
      return;
    }
    spellRenderCache.set(effectiveId, { titleText: result.titleText, contentHtml: result.contentHtml });
    renderCollapsible(host, result.titleText, result.contentHtml);
  } catch {
    renderCollapsible(host, displayNameFromSlug(effectiveId) + ' (Error)', 'Error getting this spell.');
  }
}

/** Fetch a spell page, parse HTML, and sanitize anchors */
async function fetchSpellPage(baseUrl: string, id: string): Promise<{ ok: boolean; titleText: string; contentHtml: string }> {
  const base = baseUrl.replace(/\/$/, "");
  const url = `${base}/spell:${id}`;
  const res = await requestUrl({ url, method: 'GET' });
  if (res.status < 200 || res.status >= 300) return { ok: false, titleText: "", contentHtml: "" };
  const html = res.text;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const titleEl = doc.querySelector('.page-title.page-header');
  const contentEl = doc.querySelector('#page-content');
  const titleText = titleEl ? (titleEl.textContent || '') : '';
  const missing = titleText.toLowerCase().includes('the page does not') || !titleEl || !contentEl;
  if (missing) return { ok: false, titleText: "", contentHtml: "" };
  // sanitize: replace anchors with spans
  const contentClone = contentEl.cloneNode(true) as HTMLElement;
  const links = contentClone.querySelectorAll('a');
  for (const a of Array.from(links)) {
    const span = doc.createElement('span');
    span.textContent 
  = a.textContent || '';
    a.replaceWith(span);
  }
  return { ok: true, titleText, contentHtml: contentClone.innerHTML };
}

// Try standard id first; if missing, retry once with "-ua" suffix
async function fetchSpellPageWithFallback(baseUrl: string, id: string): Promise<{ ok: boolean; titleText: string; contentHtml: string }> {
  try {
    const first = await fetchSpellPage(baseUrl, id);
    if (first.ok) return first;
  } catch {
    // Ignore error and try fallback
  }
  const second = await fetchSpellPage(baseUrl, `${id}-ua`);
  return second;
}

/** Simple collapsible UI wrapper for a spell card */
function renderCollapsible(el: HTMLElement, title: string, html: string) {
  const contentDivId = `spell-content-${Math.random().toString(36).slice(2, 11)}`;
  const arrowId = `spell-arrow-${Math.random().toString(36).slice(2, 11)}`;
  el.innerHTML = `
    <div style="display:flex; align-items:center; cursor:pointer;" id="title-${contentDivId}">
      <span style="margin-right:0.5em;" id="${arrowId}">▼</span>
      <span style="font-size: 1.1em; font-weight: 600; margin:0;">${title}</span>
    </div>
    <div id="${contentDivId}" style="display:none; margin-top:0.5em;">${html}</div>
  `;
  const titleDiv = el.querySelector(`#title-${contentDivId}`);
  const contentDiv = el.querySelector(`#${contentDivId}`);
  const arrow = el.querySelector(`#${arrowId}`);
  if (!titleDiv || !contentDiv || !arrow) return;
  titleDiv.addEventListener('click', () => {
    const c = contentDiv as HTMLElement;
    const a = arrow as HTMLElement;
    const isHidden = c.style.display === 'none';
    c.style.display = isHidden ? 'block' : 'none';
    a.textContent = isHidden ? '▲' : '▼';
  });
}
