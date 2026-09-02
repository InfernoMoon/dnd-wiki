/**
 * lineage.ts
 * Markdown code block processor for ```dnd-lineage blocks.
 */
import type { MarkdownPostProcessorContext } from 'obsidian';
import { TFile, TFolder, MarkdownRenderer, Component } from 'obsidian';
import { nameToSlug, escapeHtml } from '../utils/text';
import { fetchPageContent } from '../utils/fetcher';
import { renderCollapsible, extractCardContentHtml, requireBaseUrl } from '../utils/renderer';
import { getObsidianApp, createUid } from '../utils/obsidian';

const lineageCache = new Map<string, Map<string, { title: string; html: string }>>();

function getCacheForKey(urlKey: string): Map<string, { title: string; html: string }> {
  const existing = lineageCache.get(urlKey);
  if (existing) return existing;
  const cache = new Map<string, { title: string; html: string }>();
  lineageCache.set(urlKey, cache);
  return cache;
}

export function getCachedLineage(urlKey: string, id: string): { title: string; html: string } | null {
  return getCacheForKey(urlKey).get(id) ?? null;
}

export function setCachedLineage(urlKey: string, id: string, data: { title: string; html: string }): void {
  getCacheForKey(urlKey).set(id, data);
}

/** Strip "Lineage: " prefix from a page title if present. */
export function cleanLineageTitle(title: string): string {
  return title.replace(/^Lineage:\s*/i, '');
}

function renderLineageCard(container: HTMLElement, title: string, html: string) {
  const host = container.createDiv();
  renderCollapsible(host, title, html);
}

export async function renderLineage(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext | undefined, urlKey: string, baseUrl: string) {
  el.empty();
  if (!requireBaseUrl(el, baseUrl)) return;
  const lines = source.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) { el.createDiv({ text: 'Provide one or more lineage IDs or names.' }); return; }
  const container = el.createDiv();
  for (const lineageId of lines.map(l => nameToSlug(l)).filter(Boolean)) {
    const cached = await ensureLineageCached(lineageId, urlKey, baseUrl);
    if (cached?.html) {
      renderLineageCard(container, cached.title, cached.html);
    } else {
      const err = container.createDiv();
      err.textContent = `Failed to load lineage: ${lineageId}`;
      container.appendChild(err);
    }
  }
}

export async function findCustomLineageById(id: string): Promise<{ file: TFile; title: string; content: string } | null> {
  try {
    const app = getObsidianApp();
    const vault = app?.vault;
    const folderPath = 'DnD-Cards/Lineages';
    const folder = vault?.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return null;
    for (const child of folder.children) {
      if (child instanceof TFile && child.extension?.toLowerCase() === 'md') {
        const baseName: string = child.basename || child.name.replace(/\.md$/i, '');
        if (nameToSlug(baseName) === id) {
          if (!vault) return null;
          return { file: child, title: baseName, content: await vault.read(child) };
        }
      }
    }
    return null;
  } catch { return null; }
}

function parseCustomLineageMeta(raw: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);
  let collectingKey: string | null = null;
  let collectingBuf: string[] = [];
  const finishCollect = () => {
    if (collectingKey) meta[collectingKey] = collectingBuf.join('\n');
    collectingKey = null; collectingBuf = [];
  };
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (collectingKey) {
      const endsWithQuote = /"\s*$/.test(trimmed);
      if (endsWithQuote) { collectingBuf.push(trimmed.replace(/"\s*$/, '')); finishCollect(); }
      else collectingBuf.push(trimmed);
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
    } else { meta[key] = value; }
  }
  if (collectingKey) finishCollect();
  return meta;
}

export function buildCustomLineageHtmlStructured(content: string, title: string, uid: string): { html: string; descMarkdown: string | null; descMountId: string } {
  const meta = parseCustomLineageMeta(content);
  const abilityScores  = meta['ability-scores']   ? escapeHtml(meta['ability-scores'])   : '';
  const creatureType   = meta['creature-type']    ? escapeHtml(meta['creature-type'])    : '';
  const size           = meta['size']              ? escapeHtml(meta['size'])              : '';
  const speed          = meta['speed']             ? escapeHtml(meta['speed'])             : '';
  const traits         = meta['traits']            ? escapeHtml(meta['traits'])            : '';
  const descRaw        = meta['description'] || '';

  const parts: string[] = [];
  const spacer = '<div class="dnd-wiki-section-spacer"></div>';
  parts.push('<div>Source: Custom</div>');
  parts.push(spacer);
  if (creatureType) parts.push(`<div><strong>Creature Type:</strong> ${creatureType}</div>`);
  if (abilityScores) parts.push(`<div><strong>Ability Scores:</strong> ${abilityScores}</div>`);
  if (size) parts.push(`<div><strong>Size:</strong> ${size}</div>`);
  if (speed) parts.push(`<div><strong>Speed:</strong> ${speed}</div>`);
  if (traits) { parts.push(spacer); parts.push(`<div><strong>Traits:</strong> ${traits}</div>`); }
  const descMountId = `lineage-desc-${uid}`;
  if (descRaw) { parts.push(spacer); parts.push(`<div id="${descMountId}" class="dnd-wiki-description-mount"></div>`); }
  return { html: parts.join(''), descMarkdown: descRaw || null, descMountId };
}

async function renderCustomLineageToCache(
  lineageId: string, urlKey: string,
  custom: { file: TFile; title: string; content: string }
): Promise<{ title: string; html: string } | null> {
  const uid = createUid();
  const structured = buildCustomLineageHtmlStructured(custom.content, custom.title, uid);
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
  } catch (e) { console.warn('Custom lineage markdown render failed', e); }
  const html = extractCardContentHtml(host);
  if (html) { const cached = { title: custom.title, html }; setCachedLineage(urlKey, lineageId, cached); return cached; }
  return null;
}

async function ensureLineageCached(lineageId: string, urlKey: string, baseUrl: string): Promise<{ title: string; html: string } | null> {
  const existing = getCachedLineage(urlKey, lineageId);
  if (existing) return existing;
  const custom = await findCustomLineageById(lineageId);
  if (custom) { const cached = await renderCustomLineageToCache(lineageId, urlKey, custom); if (cached) return cached; }
  const lineagePageType = baseUrl.includes('2024') ? 'species' : 'lineage';
  const fetched = await fetchPageContent(baseUrl, lineagePageType, lineageId);
  if (fetched.ok) {
    const cached = { title: cleanLineageTitle(fetched.titleText || lineageId), html: fetched.contentHtml };
    setCachedLineage(urlKey, lineageId, cached);
    return cached;
  }
  return null;
}
