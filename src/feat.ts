import type { MarkdownPostProcessorContext } from 'obsidian';
import { App, TFile, TFolder, TAbstractFile, MarkdownRenderer, Component } from 'obsidian';
import { getBaseUrl } from './dataService';
import { nameToSlug, fetchPageContent, renderCollapsible } from './utils';

// In-memory cache for fetched feat content by id/slug
const featCache = new Map<string, { title: string; html: string }>();

export function getCachedFeat(id: string): { title: string; html: string } | null {
  return featCache.get(id) || null;
}

export function setCachedFeat(id: string, data: { title: string; html: string }): void {
  featCache.set(id, data);
}

function renderFeatCard(container: HTMLElement, title: string, html: string) {
  const host = document.createElement('div');
  container.appendChild(host);
  renderCollapsible(host, title, html);
}

// Markdown code block processor for ```dnd-feat blocks.
export async function renderFeat(source: string, el: HTMLElement, _ctx?: MarkdownPostProcessorContext) {
  el.empty();
  const baseUrl = await getBaseUrl();
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
  const container = document.createElement('div');
  el.appendChild(container);

  for (const featId of feats) {
    let cached = featCache.get(featId) || null;
    if (!cached) {
      // Try custom feat first
      const custom = await findCustomFeatById(featId);
      if (custom) {
        const { file, title, content } = custom;
        const host = document.createElement('div');
        container.appendChild(host);
        const uid = Math.random().toString(36).slice(2, 11);
        const structured = buildCustomFeatHtmlStructured(content, title, uid);
        renderCollapsible(host, title, structured.html);
        try {
          const app = (globalThis as unknown as { app?: App }).app;
          if (structured.descMarkdown && app) {
            const mount = host.querySelector(`#${structured.descMountId}`);
            if (mount instanceof HTMLElement) {
              const component = new Component();
              await MarkdownRenderer.render(app, structured.descMarkdown, mount, file.path, component);
              const contentDiv = mount.parentElement as HTMLElement | null;
              if (contentDiv) {
                const html = contentDiv.innerHTML;
                cached = { title, html };
                featCache.set(featId, cached);
              }
            }
          } else {
            const contentDiv = host.querySelector('div[id^="card-content-"]') as HTMLElement | null;
            if (contentDiv) {
              const html = contentDiv.innerHTML;
              cached = { title, html };
              featCache.set(featId, cached);
            }
          }
        } catch {
          const contentDiv = host.querySelector('div[id^="card-content-"]') as HTMLElement | null;
          if (contentDiv) {
            const html = contentDiv.innerHTML;
            cached = { title, html };
            featCache.set(featId, cached);
          }
        }
      } else {
        // Fallback to wiki fetch
        const fetched = await fetchPageContent(baseUrl, 'feat', featId);
        if (fetched.ok) {
          cached = { title: fetched.titleText || featId, html: fetched.contentHtml };
          featCache.set(featId, cached);
        }
      }
    }
    if (cached?.html) {
      renderFeatCard(container, cached.title, cached.html);
    } else {
      const err = document.createElement('div');
      err.textContent = `Failed to load feat: ${featId}`;
      container.appendChild(err);
    }
  }
}

// ---------------------------
// Custom Feat support
// ---------------------------

export async function findCustomFeatById(id: string): Promise<{ file: TFile; title: string; content: string } | null> {
  try {
    const app = (globalThis as unknown as { app?: App }).app;
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

function escapeHtml(s: string): string {
  return s.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
}

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
    if (/^"/.test(value)) {
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

export function buildCustomFeatHtmlStructured(content: string, title: string, uid: string): { html: string; descMarkdown: string | null; descMountId: string } {
  const meta = parseCustomFeatMeta(content);
  const prereq = meta['prerequisite'] ? escapeHtml(meta['prerequisite']) : '';
  const descRaw = meta['description'] || '';
  const parts: string[] = [];
  const spacer = '<div style="height:0.5em;"></div>';
  parts.push('<div>Source: Custom</div>');
  parts.push(spacer);
  if (prereq) {
    parts.push(`<div><em>Prerequisite:</em> ${prereq}</div>`);
    parts.push(spacer);
  }
  const descMountId = `feat-desc-${uid}`;
  if (descRaw) {
    parts.push(`<div id="${descMountId}" style="margin-top:0.5em;"></div>`);
    parts.push(spacer);
  }
  return { html: parts.join(''), descMarkdown: descRaw || null, descMountId };
}
