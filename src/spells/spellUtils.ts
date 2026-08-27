/**
 * spellUtils.ts
 * Shared helpers for spell rendering and data preloading.
 * - Caches known spell IDs and rendered content
 * - Preloads names from `/spells` index
 * - Fetches spell pages and applies UA fallback
 * - Renders collapsible cards with sanitized content
 */
import { TFile, TFolder, TAbstractFile, MarkdownRenderer, Component } from "obsidian";
import { getObsidianApp, nameToSlug, displayNameFromSlug, fetchPageContent, renderCollapsible } from "../utils";
import { loadFromTable, LoaderConfig } from "../genericLoader";

// In-memory cache of rendered spell content: outer key = urlKey, inner key = normalized spell id
const spellRenderCache: Map<string, Map<string, { titleText: string; contentHtml: string }>> = new Map();
// In-memory set of all known spell names per URL key (normalized ids)
const spellNameCache: Map<string, Set<string>> = new Map();

function getNameCacheForKey(urlKey: string): Set<string> {
  const existing = spellNameCache.get(urlKey);
  if (existing) return existing;
  const cache = new Set<string>();
  spellNameCache.set(urlKey, cache);
  return cache;
}

function getRenderCacheForKey(urlKey: string): Map<string, { titleText: string; contentHtml: string }> {
  const existing = spellRenderCache.get(urlKey);
  if (existing) return existing;
  const cache = new Map<string, { titleText: string; contentHtml: string }>();
  spellRenderCache.set(urlKey, cache);
  return cache;
}

/** Return known spell IDs for a specific URL key */
export function getKnownSpellIdsForKey(urlKey: string): string[] {
  return Array.from(spellNameCache.get(urlKey) ?? []).sort((a, b) => a.localeCompare(b));
}

/**
 * Seed spell names into the cache for a URL key.
 * Called by spelllist when it fetches names directly from the index,
 * so renderSingleSpell doesn't treat those names as unknown.
 */
export function seedSpellNamesForKey(urlKey: string, names: string[]): void {
  const cache = getNameCacheForKey(urlKey);
  for (const n of names) {
    const id = nameToSlug(n);
    if (id) cache.add(id);
  }
}

/** Preload spell names for a specific URL key from its `/spells` index page */
export async function preloadAllSpellNames(urlKey: string, baseUrl: string): Promise<void> {
  const cache = getNameCacheForKey(urlKey);

  // Use generic table-based loader for the /spells index
  const config: LoaderConfig = {
    baseUrl,
    indexPath: '/spells',
    tableRowSelector: 'table tr',
    tableCellSelector: 'td',
    replacePatterns: [['(ua)', ''], ['(UA)', '']],
    useLinkMethod: false,
    useTableMethod: true,
  };

  const ids = await loadFromTable(config);
  for (const id of ids) {
    cache.add(id);
  }

  // Also include any custom spells from the vault folder DnD-Cards/Spells
  try {
    const app = getObsidianApp();
    const vault = app?.vault;
    const folderPath = 'DnD-Cards/Spells';
    const folder = vault?.getAbstractFileByPath(folderPath);
    if (folder instanceof TFolder) {
      const children: TAbstractFile[] = folder.children;
      for (const child of children) {
        if (child instanceof TFile && child.extension?.toLowerCase() === 'md') {
          const baseName: string = child.basename || child.name.replace(/\.md$/i, '');
          const idSlug = nameToSlug(baseName);
          if (idSlug) cache.add(idSlug);
        }
      }
    }
  } catch (err) {
    console.warn('Unable to include custom spells during preload', err);
  }
}

/** Render a single spell card with caching and UA-aware fallback */
export async function renderSingleSpell(host: HTMLElement, urlKey: string, baseUrl: string, name: string) {
  const nameCache = getNameCacheForKey(urlKey);
  const renderCache = getRenderCacheForKey(urlKey);
  const id = nameToSlug(name);
  if (!id) {
    host.createDiv({ text: 'No spell name provided' });
    return;
  }
  // Check for a custom spell file first
  const custom = await findCustomSpellById(id);
  if (custom) {
    const { file, title, content } = custom;
    const uid = Math.random().toString(36).slice(2, 11);
    const structured = buildCustomSpellHtmlStructured(content, title, uid);
    renderCollapsible(host, title, structured.html);
    try {
      const app = getObsidianApp();
      if (structured.descMarkdown && app) {
        const mount = host.querySelector(`#${structured.descMountId}`);
        if (mount instanceof HTMLElement) {
          const component = new Component();
          await MarkdownRenderer.render(app, structured.descMarkdown, mount, file.path, component);
          const contentDiv = mount.parentElement;
          if (contentDiv) {
            renderCache.set(id, { titleText: title, contentHtml: contentDiv.innerHTML });
          }
        }
      } else {
        const contentDiv = host.querySelector('div[id^="card-content-"]');
        if (contentDiv) {
          renderCache.set(id, { titleText: title, contentHtml: contentDiv.innerHTML });
        }
      }
    } catch {
      const contentDiv = host.querySelector('div[id^="card-content-"]');
      if (contentDiv) {
        renderCache.set(id, { titleText: title, contentHtml: contentDiv.innerHTML });
      }
    }
    return;
  }
  // If not known, check UA variant; otherwise report unknown without requesting
  let effectiveId = id;
  if (!nameCache.has(id)) {
    const uaId = `${id}-ua`;
    if (nameCache.has(uaId)) {
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
  const cached = renderCache.get(effectiveId);
  if (cached) {
    renderCollapsible(host, cached.titleText, cached.contentHtml);
    return;
  }
  try {
    const result = await fetchSpellPageWithFallback(baseUrl, effectiveId);
    if (!result.ok) {
      if (!renderCache.has(effectiveId)) {
        renderCollapsible(host, displayNameFromSlug(effectiveId) + ' (Error)', 'Error loading this spell');
        return;
      }
      const cachedFallback = renderCache.get(effectiveId);
      if (cachedFallback) {
        renderCollapsible(host, cachedFallback.titleText, cachedFallback.contentHtml);
      } else {
        renderCollapsible(host, displayNameFromSlug(effectiveId) + ' (Error)', 'Error loading this spell');
      }
      return;
    }
    renderCache.set(effectiveId, { titleText: result.titleText, contentHtml: result.contentHtml });
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
    const app = getObsidianApp();
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
  const lines = raw.split(/\r?\n/);
  let collectingKey: string | null = null;
  let collectingBuf: string[] = [];
  const finishCollect = () => {
    if (collectingKey) {
      meta[collectingKey] = collectingBuf.join('\n');
    }
    collectingKey = null;
    collectingBuf = [];
  };
  for (const element of lines) {
    const rawLine = element;
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    // If we're collecting a quoted multi-line value, continue until we hit a closing quote
    if (collectingKey) {
      const endsWithQuote = /"\s*$/.test(trimmed);
      if (endsWithQuote) {
        const body = trimmed.replace(/"\s*$/, '');
        collectingBuf.push(body);
        finishCollect();
      } else {
        collectingBuf.push(trimmed);
      }
      continue;
    }
    // Standard key: value parsing
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).toLowerCase().trim();
    let value = trimmed.slice(idx + 1).trim();
    // normalize common keys
    const k = key
      .replace(/\s+/g, '-')
      .replace(/^casting-time$/i, 'casting-time')
      .replace(/^spell-lists$/i, 'spell-lists');
    // If value starts with a quote, begin collecting multi-line value until closing quote
    if (/^"/.test(value)) {
      // Strip leading opening quote
      value = value.replace(/^"/, '');
      const endsSameLine = /"\s*$/.test(value);
      if (endsSameLine) {
        // Remove trailing quote on same line
        meta[k] = value.replace(/"\s*$/, '');
      } else {
        collectingKey = k;
        collectingBuf = [value];
      }
    } else {
      meta[k] = value;
    }
  }
  // If file ended while still collecting, finalize with what we have
  if (collectingKey) finishCollect();
  return meta;
}

function buildCustomSpellHtmlStructured(content: string, title: string, uid: string): { html: string; descMarkdown: string | null; descMountId: string } {
  const meta = parseCustomSpellMeta(content);
  const levelOrdinal = toOrdinal(meta['level']);
  const school = meta['school'] ? capitalizeWords(meta['school']) : '';
  const heading = levelOrdinal ? (school ? `${levelOrdinal}-level ${school}` : `${levelOrdinal}-level`) : '';
  const castingTime = formatDuration(meta['casting-time']);
  const range = formatRange(meta['range']);
  const components = formatComponents(meta['components']);
  const duration = formatDuration(meta['duration']);
  const descriptionRaw = meta['description'] || '';
  const spellLists = formatSpellLists(meta['spell-lists']);

  const parts: string[] = [];
  const spacer = '<div class="dnd-wiki-section-spacer"></div>';
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
  const descMountId = `desc-${uid}`;
  if (descriptionRaw) {
    parts.push(`<div id="${descMountId}" class="dnd-wiki-description-mount"></div>`);
    parts.push(spacer);
  }
  if (spellLists) parts.push(`<div class="dnd-wiki-spell-lists"><strong><em>Spell Lists.</em></strong> ${spellLists}</div>`);
  return { html: parts.join(''), descMarkdown: descriptionRaw || null, descMountId };
}

// ---------------------------
// Custom spell metadata export
// ---------------------------

export interface CustomSpellEntry {
  id: string; // slug from filename
  displayName: string; // filename as display
  level?: number;
  classes?: string[]; // slugs
  school?: string; // slug
}

export async function getCustomSpellEntries(): Promise<CustomSpellEntry[]> {
  const out: CustomSpellEntry[] = [];
  try {
    const app = getObsidianApp();
    const vault = app?.vault;
    const folderPath = 'DnD-Cards/Spells';
    const folder = vault?.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder) || !vault) return out;
    for (const child of folder.children) {
      if (child instanceof TFile && child.extension?.toLowerCase() === 'md') {
        const baseName: string = child.basename || child.name.replace(/\.md$/i, '');
        const id = nameToSlug(baseName);
        const raw = await vault.read(child);
        const meta = parseCustomSpellMeta(raw);
        const levelRaw = meta['level'];
        const level = levelRaw !== undefined ? Number.parseInt(String(levelRaw).trim(), 10) : undefined;
        const classes = meta['spell-lists']
          ? meta['spell-lists'].split(',').map(s => s.trim()).filter(Boolean).map(nameToSlug)
          : undefined;
        const school = meta['school'] ? nameToSlug(meta['school']) : undefined;
        out.push({ id, displayName: baseName, level: level === undefined || Number.isNaN(level) ? undefined : level, classes, school });
      }
    }
  } catch {
    // ignore
  }
  return out;
}
