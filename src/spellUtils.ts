/**
 * spellUtils.ts
 * Shared helpers for spell rendering and data preloading.
 * - Caches known spell IDs and rendered content
 * - Preloads names from `/spells` index
 * - Fetches spell pages and applies UA fallback
 * - Renders collapsible cards with sanitized content
 */
import { requestUrl, App, TFile, TFolder, TAbstractFile } from "obsidian";
import { nameToSlug, displayNameFromSlug, fetchPageContent, renderCollapsible } from "./utils";

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
    // Also include any custom spells from the vault folder DnD-Cards/Spells
    try {
      const app = (globalThis as unknown as { app?: App }).app;
      const vault = app?.vault;
      const folderPath = 'DnD-Cards/Spells';
      const folder = vault?.getAbstractFileByPath(folderPath);
      if (folder instanceof TFolder) {
        const children: TAbstractFile[] = folder.children;
        for (const child of children) {
          if (child instanceof TFile && child.extension?.toLowerCase() === 'md') {
            const baseName: string = child.basename || child.name.replace(/\.md$/i, '');
            const idSlug = nameToSlug(baseName);
            if (idSlug) spellNameCache.add(idSlug);
          }
        }
      }
    } catch (err) {
      console.warn('Unable to include custom spells during preload', err);
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
  // Check for a custom spell file first
  const custom = await findCustomSpellById(id);
  if (custom) {
    const { file, title, content } = custom;
    // Format custom spell content to standardized HTML layout
    const html = buildCustomSpellHtml(content, title, file.path);
    spellRenderCache.set(id, { titleText: title, contentHtml: html });
    renderCollapsible(host, title, html);
    return;
  }
  // If not known, check UA variant; otherwise report unknown without requesting
  let effectiveId = id;
  if (!spellNameCache.has(id)) {
    const uaId = `${id}-ua`;
    if (spellNameCache.has(uaId)) {
      effectiveId = uaId;
    } else {
      renderCollapsible(
        host,
        displayNameFromSlug(id) + ' (Not Found)',
        'Spell not found. Verify the name, or reload the page to refresh data.'
      );
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

/** Fetch a spell page via generic wiki fetcher */
async function fetchSpellPage(baseUrl: string, id: string): Promise<{ ok: boolean; titleText: string; contentHtml: string }> {
  return fetchPageContent(baseUrl, 'spell', id);
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

// renderCollapsible moved to utils.ts and imported

/** Try to find a custom spell file by slugged id in DnD-Cards/Spells */
async function findCustomSpellById(id: string): Promise<{ file: TFile; title: string; content: string } | null> {
  try {
    const app = (globalThis as unknown as { app?: App }).app;
    const vault = app?.vault;
    const folderPath = 'DnD-Cards/Spells';
    const folder = vault?.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return null;
    const children: TAbstractFile[] = folder.children;
    // Attempt direct match first
    for (const child of children) {
      if (child instanceof TFile && child.extension?.toLowerCase() === 'md') {
        const baseName: string = child.basename || child.name.replace(/\.md$/i, '');
        if (nameToSlug(baseName) === id) {
          if (!vault) return null;
          const content = await vault.read(child);
          const title = baseName; // Use md file name as the title
          return { file: child, title, content };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------
// Custom spell formatting
// ---------------------------

function escapeHtml(s: string): string {
  return s
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;');
}

function toOrdinal(nRaw: string | number | undefined): string | null {
  if (nRaw === undefined || nRaw === null) return null;
  const n = typeof nRaw === 'number' ? nRaw : Number.parseInt(String(nRaw).trim(), 10);
  if (Number.isNaN(n)) return null;
  const j = n % 10, k = n % 100;
  const suffix = (k === 11 || k === 12 || k === 13) ? 'th' : (j === 1 ? 'st' : j === 2 ? 'nd' : j === 3 ? 'rd' : 'th');
  return `${n}${suffix}`;
}

function capitalizeWords(s?: string): string {
  if (!s) return '';
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function normalizeSpaces(s: string): string {
  return s.replace(/\u00A0/g, ' ').trim();
}

function formatRange(s?: string): string {
  if (!s) return '';
  const x = normalizeSpaces(s);
  return escapeHtml(x.replace(/ft\b/i, 'feet'));
}

function formatDuration(s?: string): string {
  if (!s) return '';
  const x = normalizeSpaces(s);
  return escapeHtml(x);
}

function formatComponents(s?: string): string {
  if (!s) return '';
  const x = normalizeSpaces(s);
  return escapeHtml(x);
}

function formatSpellLists(s?: string): string {
  if (!s) return '';
  const parts = s.split(',').map(p => p.trim()).filter(Boolean).map(capitalizeWords);
  return escapeHtml(parts.join(', '));
}

function parseCustomSpellMeta(raw: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(':')) continue;
    const idx = trimmed.indexOf(':');
    const key = trimmed.slice(0, idx).toLowerCase().trim();
    const value = trimmed.slice(idx + 1).trim();
    // normalize common keys
    const k = key
      .replace(/\s+/g, '-')
      .replace(/^casting-time$/i, 'casting-time')
      .replace(/^spell-lists$/i, 'spell-lists');
    meta[k] = value;
  }
  return meta;
}

function buildCustomSpellHtml(content: string, title: string, sourcePath: string): string {
  const meta = parseCustomSpellMeta(content);
  const levelOrdinal = toOrdinal(meta['level']);
  const school = meta['school'] ? capitalizeWords(meta['school']) : '';
  const heading = levelOrdinal ? (school ? `${levelOrdinal}-level ${school}` : `${levelOrdinal}-level`) : '';
  const castingTime = formatDuration(meta['casting-time']);
  const range = formatRange(meta['range']);
  const components = formatComponents(meta['components']);
  const duration = formatDuration(meta['duration']);
  const description = meta['description'] ? escapeHtml(meta['description']) : '';
  const spellLists = formatSpellLists(meta['spell-lists']);

  const parts: string[] = [];
  const spacer = '<div style="height:0.5em;"></div>';
  parts.push('<div>Source: Custom</div>');
  parts.push(spacer);
  if (heading) {
    parts.push(`<div><em>${escapeHtml(heading)}</em></div>`);
    parts.push(spacer);
  }
  if (castingTime) parts.push(`<div><strong>Casting Time:</strong> ${castingTime}</div>`);
  if (range) parts.push(`<div><strong>Range:</strong> ${range}</div>`);
  if (components) parts.push(`<div><strong>Components:</strong> ${components}</div>`);
  if (duration) {
    parts.push(`<div><strong>Duration:</strong> ${duration}</div>`);
    parts.push(spacer);
  }
  if (description) {
    parts.push(`<div style="margin-top:0.5em;">${description}</div>`);
    parts.push(spacer);
  }
  if (spellLists) parts.push(`<div style="margin-top:0.5em;"><strong><em>Spell Lists.</em></strong> ${spellLists}</div>`);
  return parts.join('');
}
