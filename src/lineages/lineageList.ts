/**
 * lineageList.ts
 * Renders a list of lineages as collapsible cards.
 */
import type { MarkdownPostProcessorContext } from 'obsidian';
import { Component, MarkdownRenderer } from 'obsidian';
import { getKnownLineageIdsForKey } from './lineageUtils';
import { getCachedLineage, setCachedLineage, findCustomLineageById, buildCustomLineageHtmlStructured, cleanLineageTitle } from './lineage';
import { fetchPageContent, getObsidianApp, renderCollapsible, displayNameFromSlug, parseSearchDirective, parseSearchModeDirective } from '../utils';

export async function renderLineageList(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext | undefined, urlKey: string, baseUrl: string) {
  el.empty();
  if (!baseUrl) { el.createDiv({ text: 'Base URL is not configured.' }); return; }
  const searches = parseSearchDirective(source);
  const searchMode = parseSearchModeDirective(source);

  const ids = getKnownLineageIdsForKey(urlKey);
  if (!ids.length) {
    const msg = el.createDiv({ text: 'No lineages found (preload may not have completed). Retrying…' });
    const start = Date.now();
    const intervalId = window.setInterval(async () => {
      const current = getKnownLineageIdsForKey(urlKey);
      if (current.length) {
        window.clearInterval(intervalId);
        el.empty();
        const container = el.createDiv();
        await Promise.all(current.map(async (id) => {
          const host = container.createDiv();
          const cached = getCachedLineage(urlKey, id);
          if (cached?.html) { renderCollapsible(host, cached.title, cached.html); return; }
          const lineagePageType = baseUrl.includes('2024') ? 'species' : 'lineage';
          const res = await fetchPageContent(baseUrl, lineagePageType, id);
          if (res.ok) {
            const title = cleanLineageTitle(res.titleText || displayNameFromSlug(id));
            renderCollapsible(host, title, res.contentHtml);
            setCachedLineage(urlKey, id, { title, html: res.contentHtml });
          } else { host.textContent = `Failed to load lineage: ${displayNameFromSlug(id)}`; }
        }));
      } else {
        const secs = Math.floor((Date.now() - start) / 1000);
        if (secs >= 30) { window.clearInterval(intervalId); msg.textContent = 'No lineages found after 30s.'; }
        else msg.textContent = 'No lineages found yet…';
      }
    }, 1000);
    return;
  }

  const container = el.createDiv();

  await Promise.all(ids.map(async (id) => {
    const host = container.createDiv();
    await (async () => {
      const cached = getCachedLineage(urlKey, id);
      if (cached?.html) { renderCollapsible(host, cached.title, cached.html); return; }
      const custom = await findCustomLineageById(id);
      if (custom) {
        const { file, title, content } = custom;
        const uid = Math.random().toString(36).slice(2, 11);
        const structured = buildCustomLineageHtmlStructured(content, title, uid);
        renderCollapsible(host, title, structured.html);
        try {
          const app = getObsidianApp();
          if (structured.descMarkdown && app) {
            const mount = host.querySelector(`#${structured.descMountId}`);
            if (mount instanceof HTMLElement) {
              const component = new Component();
              await MarkdownRenderer.render(app, structured.descMarkdown, mount, file.path, component);
              setCachedLineage(urlKey, id, { title, html: (mount.parentElement?.innerHTML) || structured.html });
            }
          } else { setCachedLineage(urlKey, id, { title, html: structured.html }); }
        } catch { setCachedLineage(urlKey, id, { title, html: structured.html }); }
        return;
      }
      const lineagePageType = baseUrl.includes('2024') ? 'species' : 'lineage';
      const res = await fetchPageContent(baseUrl, lineagePageType, id);
      if (res.ok) {
        const title = cleanLineageTitle(res.titleText || displayNameFromSlug(id));
        renderCollapsible(host, title, res.contentHtml);
        setCachedLineage(urlKey, id, { title, html: res.contentHtml });
      } else { host.textContent = `Failed to load lineage: ${displayNameFromSlug(id)}`; }
    })();
    if (searches.length > 0) {
      const text = host.textContent?.toLowerCase() || '';
      const match = searchMode === 'and' ? searches.every(s => text.includes(s)) : searches.some(s => text.includes(s));
      if (!match) host.classList.add('dnd-wiki-search-hidden');
    }
  }));
}
