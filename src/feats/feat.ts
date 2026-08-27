/**
 * feat.ts
 * Markdown code block processor for ```dnd-feat blocks.
 * Renders one or more feat cards. Tries custom vault feats first,
 * then falls back to fetching from the configured Base URL.
 * Keeps the entrypoint focused on parsing input and layout while
 * delegating rendering details to helpers and the collapsible UI.
 */
import type { MarkdownPostProcessorContext } from 'obsidian';
import { TFile, TFolder, TAbstractFile, MarkdownRenderer, Component } from 'obsidian';
import { nameToSlug, fetchPageContent, renderCollapsible, escapeHtml, getObsidianApp, createUid, extractCardContentHtml } from '../utils';

// In-memory cache for fetched feat content: outer key = urlKey, inner key = feat id/slug
const featCache = new Map<string, Map<string, { title: string; html: string }>>();

function getCacheForKey(urlKey: string): Map<string, { title: string; html: string }> {
  const existing = featCache.get(urlKey);
  if (existing) return existing;
  const cache = new Map<string, { title: string; html: string }>();
  featCache.set(urlKey, cache);
  return cache;
}

/**
 * Get a cached feat render by URL key and ID.
 * @param urlKey The URL key the feat belongs to (e.g. "5e", "2024").
 * @param id Feat slug/ID to look up.
 * @returns Cached title and HTML if present, otherwise null.
 */
export function getCachedFeat(urlKey: string, id: string): { title: string; html: string } | null {
  return getCacheForKey(urlKey).get(id) ?? null;
}

/**
 * Store a rendered feat in the cache.
 * @param urlKey The URL key the feat belongs to.
 * @param id Feat slug/ID to cache under.
 * @param data Object containing card title and HTML.
 */
export function setCachedFeat(urlKey: string, id: string, data: { title: string; html: string }): void {
  getCacheForKey(urlKey).set(id, data);
}

/**
 * Append a collapsible feat card to a container.
 * @param container Parent element to receive the card.
 * @param title Card header title.
 * @param html Pre-rendered inner HTML content.
 */
function renderFeatCard(container: HTMLElement, title: string, html: string) {
  const host = container.createDiv();
  renderCollapsible(host, title, html);
}

/**
 * Render one or more feats inside a ```dnd-feat code block.
 * - Splits the block content into lines (each a feat name)
 * - Validates Base URL from settings
 * - Creates a container and renders each feat as a collapsible card
 * - Prefers custom vault items; otherwise fetches from Base URL
 */
/**
 * Entry point for ```dnd-feat blocks; renders one or more feat cards.
 * @param source Raw block text; each non-empty line is a feat name/ID.
 * @param el Target element where cards will be appended.
 * @param _ctx Obsidian processor context (unused).
 */
export async function renderFeat(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext | undefined, urlKey: string, baseUrl: string) {
  el.empty();
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
  const container = el.createDiv();

  for (const featId of feats) {
    const cached = await ensureFeatCached(featId, urlKey, baseUrl);
    if (cached?.html) {
      renderFeatCard(container, cached.title, cached.html);
    } else {
      const err = container.createDiv();
      err.textContent = `Failed to load feat: ${featId}`;
      container.appendChild(err);
    }
  }
}

// ---------------------------
// Custom Feat support
// ---------------------------

/**
 * Locate a custom feat in the vault by slug/ID and return its file and content.
 * @param id Slug/ID derived from the feat name.
 * @returns File, display title, and raw markdown content or null.
 */
export async function findCustomFeatById(id: string): Promise<{ file: TFile; title: string; content: string } | null> {
  try {
    const app = getObsidianApp();
    const vault = app?.vault;
    const folderPath = 'DnD-Cards/Feats';
    const folder = vault?.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return null;
    const children: TAbstractFile[] = folder.children;
    for (const child of children) {
      if (child instanceof TFile && child.extension?.toLowerCase() === 'md') {
        const baseName: string = child.basename || child.name.replace(/\.md$/i, '');
        if (nameToSlug(baseName) === id) {
          if (!vault) return null;
          const content = await vault.read(child);
          const title = baseName;
          return { file: child, title, content };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse simple key:value metadata from custom feat markdown content.
 * Supports quoted multi-line values.
 * @param raw Full markdown content.
 * @returns Map of normalized keys to values.
 */
function parseCustomFeatMeta(raw: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);
  let collectingKey: string | null = null;
  let collectingBuf: string[] = [];
  const finishCollect = () => {
    if (collectingKey) meta[collectingKey] = collectingBuf.join('\n');
    collectingKey = null;
    collectingBuf = [];
  };
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
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
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).toLowerCase().trim().replace(/\s+/g, '-');
    let value = trimmed.slice(idx + 1).trim();
    if (value.startsWith("\"")) {
      value = value.replace(/^"/, '');
      const endsSameLine = /"\s*$/.test(value);
      if (endsSameLine) meta[key] = value.replace(/"\s*$/, '');
      else {
        collectingKey = key;
        collectingBuf = [value];
      }
    } else {
      meta[key] = value;
    }
  }
  if (collectingKey) finishCollect();
  return meta;
}

/**
 * Build the structured HTML shell for a custom feat card.
 * @param content Raw markdown content of the feat file.
 * @param title Display title for the card.
 * @param uid Unique identifier used to wire the description mount.
 * @returns HTML shell plus optional description markdown and mount ID.
 */
export function buildCustomFeatHtmlStructured(content: string, title: string, uid: string): { html: string; descMarkdown: string | null; descMountId: string } {
  const meta = parseCustomFeatMeta(content);
  const prereq = meta['prerequisite'] ? escapeHtml(meta['prerequisite']) : '';
  const descRaw = meta['description'] || '';
  const parts: string[] = [];
  const spacer = '<div class="dnd-wiki-section-spacer"></div>';
  parts.push('<div>Source: Custom</div>');
  parts.push(spacer);
  if (prereq) {
    parts.push(`<div><em>Prerequisite:</em> ${prereq}</div>`);
    parts.push(spacer);
  }
  const descMountId = `feat-desc-${uid}`;
  if (descRaw) {
    parts.push(`<div id="${descMountId}" class="dnd-wiki-description-mount"></div>`);
    parts.push(spacer);
  }
  return { html: parts.join(''), descMarkdown: descRaw || null, descMountId };
}

// ---------------------------
// Helper utilities to reduce complexity and warnings

/**
 * Render a custom feat card, mount its markdown description, and cache the HTML.
 * @param featId Slug/ID used as cache key.
 * @param custom File, display title, and raw content of the custom feat.
 * @returns Cached title and HTML, or null on failure.
 */
async function renderCustomFeatToCache(
  featId: string,
  urlKey: string,
  custom: { file: TFile; title: string; content: string }
): Promise<{ title: string; html: string } | null> {
  const uid = createUid();
  const structured = buildCustomFeatHtmlStructured(custom.content, custom.title, uid);
  const fragment = document.createDocumentFragment();
  const host = fragment.createDiv();
  renderCollapsible(host, custom.title, structured.html);
  try {
    const app = getObsidianApp();
    if (structured.descMarkdown && app) {
      const mount = host.querySelector(`#${structured.descMountId}`);
      if (mount instanceof HTMLElement) {
        const component = new Component();
        await MarkdownRenderer.render(app, structured.descMarkdown, mount, custom.file.path, component);
      }
    }
  } catch (e) {
    console.warn('Custom feat markdown render failed', e);
  }
  const html = extractCardContentHtml(host);
  if (html) {
    const cached = { title: custom.title, html };
    setCachedFeat(urlKey, featId, cached);
    return cached;
  }
  return null;
}

/**
 * Ensure a feat is present in the cache by trying custom-first then fetching.
 * @param featId Slug/ID of the feat.
 * @param baseUrl Configured base URL used for fallback fetch.
 * @returns Cached title and HTML or null if unavailable.
 */
async function ensureFeatCached(
  featId: string,
  urlKey: string,
  baseUrl: string
): Promise<{ title: string; html: string } | null> {
  const existing = getCachedFeat(urlKey, featId);
  if (existing) return existing;
  const custom = await findCustomFeatById(featId);
  if (custom) {
    const cached = await renderCustomFeatToCache(featId, urlKey, custom);
    if (cached) return cached;
  }
  const fetched = await fetchPageContent(baseUrl, 'feat', featId);
  if (fetched.ok) {
    const cached = { title: fetched.titleText || featId, html: fetched.contentHtml };
    setCachedFeat(urlKey, featId, cached);
    return cached;
  }
  return null;
}
