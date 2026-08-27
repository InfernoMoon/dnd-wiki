/**
 * background.ts
 * Markdown code block processor for ```dnd-background blocks.
 * Renders one or more background cards. Tries custom vault backgrounds first,
 * then falls back to fetching from the configured Base URL.
 */
import type { MarkdownPostProcessorContext } from 'obsidian';
import { TFile, TFolder, TAbstractFile, MarkdownRenderer, Component } from 'obsidian';
import { nameToSlug, fetchPageContent, renderCollapsible, escapeHtml, getObsidianApp, createUid, extractCardContentHtml } from '../utils';

// In-memory cache: outer key = urlKey, inner key = background id/slug
const backgroundCache = new Map<string, Map<string, { title: string; html: string }>>();

function getCacheForKey(urlKey: string): Map<string, { title: string; html: string }> {
  const existing = backgroundCache.get(urlKey);
  if (existing) return existing;
  const cache = new Map<string, { title: string; html: string }>();
  backgroundCache.set(urlKey, cache);
  return cache;
}

export function getCachedBackground(urlKey: string, id: string): { title: string; html: string } | null {
  return getCacheForKey(urlKey).get(id) ?? null;
}

export function setCachedBackground(urlKey: string, id: string, data: { title: string; html: string }): void {
  getCacheForKey(urlKey).set(id, data);
}

function renderBackgroundCard(container: HTMLElement, title: string, html: string) {
  const host = container.createDiv();
  renderCollapsible(host, title, html);
}

export async function renderBackground(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext | undefined, urlKey: string, baseUrl: string) {
  el.empty();
  if (!baseUrl) {
    el.createEl('div', { text: 'Base URL is not configured.' });
    return;
  }

  const lines = source.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) {
    el.createEl('div', { text: 'Provide one or more background IDs or names.' });
    return;
  }

  const backgrounds = lines.map(l => nameToSlug(l)).filter(Boolean);
  const container = el.createDiv();

  for (const bgId of backgrounds) {
    const cached = await ensureBackgroundCached(bgId, urlKey, baseUrl);
    if (cached?.html) {
      renderBackgroundCard(container, cached.title, cached.html);
    } else {
      const err = container.createDiv();
      err.textContent = `Failed to load background: ${bgId}`;
      container.appendChild(err);
    }
  }
}

// ---------------------------
// Custom Background support
// ---------------------------

export async function findCustomBackgroundById(id: string): Promise<{ file: TFile; title: string; content: string } | null> {
  try {
    const app = getObsidianApp();
    const vault = app?.vault;
    const folderPath = 'DnD-Cards/Backgrounds';
    const folder = vault?.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return null;
    const children: TAbstractFile[] = folder.children;
    for (const child of children) {
      if (child instanceof TFile && child.extension?.toLowerCase() === 'md') {
        const baseName: string = child.basename || child.name.replace(/\.md$/i, '');
        if (nameToSlug(baseName) === id) {
          if (!vault) return null;
          const content = await vault.read(child);
          return { file: child, title: baseName, content };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function parseCustomBackgroundMeta(raw: string): Record<string, string> {
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
        collectingBuf.push(trimmed.replace(/"\s*$/, ''));
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
    if (value.startsWith('"')) {
      value = value.replace(/^"/, '');
      if (/"\s*$/.test(value)) meta[key] = value.replace(/"\s*$/, '');
      else { collectingKey = key; collectingBuf = [value]; }
    } else {
      meta[key] = value;
    }
  }
  if (collectingKey) finishCollect();
  return meta;
}

export function buildCustomBackgroundHtmlStructured(content: string, title: string, uid: string): { html: string; descMarkdown: string | null; descMountId: string } {
  const meta = parseCustomBackgroundMeta(content);
  const skillProfs   = meta['skill-proficiencies']  ? escapeHtml(meta['skill-proficiencies'])  : '';
  const toolProfs    = meta['tool-proficiencies']   ? escapeHtml(meta['tool-proficiencies'])   : '';
  const languages    = meta['languages']             ? escapeHtml(meta['languages'])             : '';
  const equipment    = meta['equipment']             ? escapeHtml(meta['equipment'])             : '';
  const feature      = meta['feature']               ? escapeHtml(meta['feature'])               : '';
  const descRaw      = meta['description'] || '';

  const parts: string[] = [];
  const spacer = '<div class="dnd-wiki-section-spacer"></div>';
  parts.push('<div>Source: Custom</div>');
  parts.push(spacer);
  if (skillProfs)  parts.push(`<div><strong>Skill Proficiencies:</strong> ${skillProfs}</div>`);
  if (toolProfs)   parts.push(`<div><strong>Tool Proficiencies:</strong> ${toolProfs}</div>`);
  if (languages)   parts.push(`<div><strong>Languages:</strong> ${languages}</div>`);
  if (equipment)   parts.push(`<div><strong>Equipment:</strong> ${equipment}</div>`);
  if (feature) {
    parts.push(spacer);
    parts.push(`<div><strong>Feature:</strong> ${feature}</div>`);
  }
  const descMountId = `bg-desc-${uid}`;
  if (descRaw) {
    parts.push(spacer);
    parts.push(`<div id="${descMountId}" class="dnd-wiki-description-mount"></div>`);
  }
  return { html: parts.join(''), descMarkdown: descRaw || null, descMountId };
}

async function renderCustomBackgroundToCache(
  bgId: string,
  urlKey: string,
  custom: { file: TFile; title: string; content: string }
): Promise<{ title: string; html: string } | null> {
  const uid = createUid();
  const structured = buildCustomBackgroundHtmlStructured(custom.content, custom.title, uid);
  const host = createDiv();
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
    console.warn('Custom background markdown render failed', e);
  }
  const html = extractCardContentHtml(host);
  if (html) {
    const cached = { title: custom.title, html };
    setCachedBackground(urlKey, bgId, cached);
    return cached;
  }
  return null;
}

/** Strip "Background: " prefix from a page title if present. */
export function cleanBackgroundTitle(title: string): string {
  return title.replace(/^Background:\s*/i, '');
}

async function ensureBackgroundCached(
  bgId: string,
  urlKey: string,
  baseUrl: string
): Promise<{ title: string; html: string } | null> {
  const existing = getCachedBackground(urlKey, bgId);
  if (existing) return existing;
  const custom = await findCustomBackgroundById(bgId);
  if (custom) {
    const cached = await renderCustomBackgroundToCache(bgId, urlKey, custom);
    if (cached) return cached;
  }
  const fetched = await fetchPageContent(baseUrl, 'background', bgId);
  if (fetched.ok) {
    const cached = { title: cleanBackgroundTitle(fetched.titleText || bgId), html: fetched.contentHtml };
    setCachedBackground(urlKey, bgId, cached);
    return cached;
  }
  return null;
}
