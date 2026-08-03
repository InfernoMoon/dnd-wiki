/**
 * item.ts
 * Markdown code block processor for ```dnd-item blocks.
 * Renders one or more item cards by fetching from the configured Base URL.
 * Uses a simple in-memory cache and shared collapsible UI renderer.
 */
import type { MarkdownPostProcessorContext } from 'obsidian';
import { App, TFile, TFolder, TAbstractFile, MarkdownRenderer, Component } from 'obsidian';
import { nameToSlug, fetchPageContent, renderCollapsible, displayNameFromSlug } from '../utils';

// Cache for fetched item content: outer key = urlKey, inner key = item id
const itemCache = new Map<string, Map<string, { title: string; html: string }>>();

function getItemCacheForKey(urlKey: string): Map<string, { title: string; html: string }> {
  if (!itemCache.has(urlKey)) itemCache.set(urlKey, new Map());
  return itemCache.get(urlKey)!;
}

/**
 * Get a cached item render by URL key and ID.
 */
export function getCachedItem(urlKey: string, id: string): { title: string; html: string } | null {
  return getItemCacheForKey(urlKey).get(id) ?? null;
}

/**
 * Store a rendered item in the cache under the correct URL key.
 */
export function setCachedItem(urlKey: string, id: string, data: { title: string; html: string }): void {
  getItemCacheForKey(urlKey).set(id, data);
}

/**
 * Append a collapsible item card to a container.
 * @param container Parent element to receive the card.
 * @param title Card header title.
 * @param html Pre-rendered inner HTML content.
 */
function renderItemCard(container: HTMLElement, title: string, html: string) {
  const host = document.createElement('div');
  host.style.marginBottom = '0.75em';
  container.appendChild(host);
  renderCollapsible(host, title, html);
}

/**
 * Entry point for ```dnd-item blocks; renders one or more item cards.
 * @param source Raw block text; each non-empty line is an item name/ID.
 * @param el Target element where cards will be appended.
 * @param _ctx Obsidian processor context (unused).
 */
export async function renderItem(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext | undefined, urlKey: string, baseUrl: string) {
  el.empty();
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
    // Try custom item first
    const custom = await findCustomItemById(id);
    if (custom) {
      const { file, title, content } = custom;
      const uid = Math.random().toString(36).slice(2, 11);
      const structured = buildCustomItemHtmlStructured(content, title, uid);
      const host = document.createElement('div');
      host.style.marginBottom = '0.75em';
      container.appendChild(host);
      renderCollapsible(host, title, structured.html);
      if (structured.descMarkdown) {
        try {
          const app = (globalThis as unknown as { app?: App }).app;
          if (app) {
            const mount = host.querySelector(`#${structured.descMountId}`);
            if (mount instanceof HTMLElement) {
              const component = new Component();
              await MarkdownRenderer.render(app, structured.descMarkdown, mount, file.path, component);
              const contentDiv = mount.parentElement as HTMLElement | null;
              if (contentDiv) {
                setCachedItem(urlKey, id, { title, html: contentDiv.innerHTML });
              }
            }
          }
        } catch {
          // Best effort cache
          const contentDiv = host.querySelector('div[id^="card-content-"]');
          if (contentDiv) {
            setCachedItem(urlKey, id, { title, html: contentDiv.innerHTML });
          }
        }
        continue;
      } else {
        const contentDiv = host.querySelector('div[id^="card-content-"]');
        if (contentDiv) {
          setCachedItem(urlKey, id, { title, html: contentDiv.innerHTML });
        }
        continue;
      }
    }

    // Fallback to remote item
    const itemPageType = baseUrl.includes('2024') ? 'magic-item' : 'wondrous-items';
    let cached = getCachedItem(urlKey, id);
    if (!cached) {
      const res = await fetchPageContent(baseUrl, itemPageType, id);
      if (res.ok) {
        const title = res.titleText || displayNameFromSlug(id);
        cached = { title, html: res.contentHtml };
        setCachedItem(urlKey, id, cached);
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

// ---------------------------
// Custom item support
// ---------------------------

function escapeHtml(s: string): string {
  return s
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;');
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

function parseCustomItemMeta(raw: string): Record<string, string> {
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
    if (/^"/.test(value)) {
      value = value.replace(/^"/, '');
      const endsSameLine = /"\s*$/.test(value);
      if (endsSameLine) {
        meta[key] = value.replace(/"\s*$/, '');
      } else {
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

function buildCustomItemHtmlStructured(content: string, title: string, uid: string): { html: string; descMarkdown: string | null; descMountId: string } {
  const meta = parseCustomItemMeta(content);
  const type = meta['type'] ? capitalizeWords(normalizeSpaces(meta['type'])) : '';
  const level = meta['level'] ? capitalizeWords(normalizeSpaces(meta['level'])) : '';
  const attuned = meta['attuned'] ? capitalizeWords(normalizeSpaces(meta['attuned'])) : '';
  const descriptionRaw = meta['description'] || '';

  const parts: string[] = [];
  const spacer = '<div style="height:0.5em;"></div>';
  parts.push('<div>Source: Custom</div>');
  parts.push(spacer);
  if (type) parts.push(`<div><strong>Type:</strong> ${escapeHtml(type)}</div>`);
  if (level) parts.push(`<div><strong>Rarity:</strong> ${escapeHtml(level)}</div>`);
  if (attuned) parts.push(`<div><strong>Attunement:</strong> ${escapeHtml(attuned)}</div>`);
  if (type || level || attuned) parts.push(spacer);
  const descMountId = `desc-${uid}`;
  if (descriptionRaw) {
    parts.push(`<div id="${descMountId}" style="margin-top:0.5em;"></div>`);
    parts.push(spacer);
  }
  return { html: parts.join(''), descMarkdown: descriptionRaw || null, descMountId };
}

async function findCustomItemById(id: string): Promise<{ file: TFile; title: string; content: string } | null> {
  try {
    const app = (globalThis as unknown as { app?: App }).app;
    const vault = app?.vault;
    const folderPath = 'DnD-Cards/Items';
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
