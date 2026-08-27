/**
 * backgroundList.ts
 * Renders a list of backgrounds as collapsible cards.
 */
import type { MarkdownPostProcessorContext } from 'obsidian';
import { Component, MarkdownRenderer } from 'obsidian';
import { getKnownBackgroundIdsForKey } from './backgroundUtils';
import { getCachedBackground, setCachedBackground, findCustomBackgroundById, buildCustomBackgroundHtmlStructured, cleanBackgroundTitle } from './background';
import { fetchPageContent, getObsidianApp, renderCollapsible, displayNameFromSlug, parseSearchDirective, parseSearchModeDirective } from '../utils';

export async function renderBackgroundList(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext | undefined, urlKey: string, baseUrl: string) {
  el.empty();
  if (!baseUrl) {
    el.createEl('div', { text: 'Base URL is not configured.' });
    return;
  }
  const searches = parseSearchDirective(source);
  const searchMode = parseSearchModeDirective(source);

  const ids = getKnownBackgroundIdsForKey(urlKey);
  if (!ids.length) {
    const msg = el.createEl('div', { text: 'No backgrounds found (preload may not have completed). Retrying…' });
    const start = Date.now();
    const intervalId = window.setInterval(async () => {
      const current = getKnownBackgroundIdsForKey(urlKey);
      if (current.length) {
        window.clearInterval(intervalId);
        el.empty();
        const container = el.createDiv();
        const tasks = current.map(async (id) => {
          const host = container.createDiv();
          const cached = getCachedBackground(urlKey, id);
          if (cached?.html) { renderCollapsible(host, cached.title, cached.html); return; }
          const res = await fetchPageContent(baseUrl, 'background', id);
          if (res.ok) {
            const title = cleanBackgroundTitle(res.titleText || displayNameFromSlug(id));
            renderCollapsible(host, title, res.contentHtml);
            setCachedBackground(urlKey, id, { title, html: res.contentHtml });
          } else {
            host.textContent = `Failed to load background: ${displayNameFromSlug(id)}`;
          }
        });
        await Promise.all(tasks);
      } else {
        const secs = Math.floor((Date.now() - start) / 1000);
        if (secs >= 30) {
          window.clearInterval(intervalId);
          msg.textContent = 'No backgrounds found after 30s. Please ensure preloading ran or reload the plugin.';
        } else {
          msg.textContent = 'No backgrounds found yet…';
        }
      }
    }, 1000);
    return;
  }

  const container = el.createDiv();

  const tasks = ids
    .map(async (id) => {
    const host = container.createDiv();
    await (async () => {
    const cached = getCachedBackground(urlKey, id);
    if (cached?.html) { renderCollapsible(host, cached.title, cached.html); return; }
    const custom = await findCustomBackgroundById(id);
    if (custom) {
      const { file, title, content } = custom;
      const uid = Math.random().toString(36).slice(2, 11);
      const structured = buildCustomBackgroundHtmlStructured(content, title, uid);
      renderCollapsible(host, title, structured.html);
      try {
        const app = getObsidianApp();
        if (structured.descMarkdown && app) {
          const mount = host.querySelector(`#${structured.descMountId}`);
          if (mount instanceof HTMLElement) {
            const component = new Component();
            await MarkdownRenderer.render(app, structured.descMarkdown, mount, file.path, component);
            setCachedBackground(urlKey, id, { title, html: (mount.parentElement?.innerHTML) || structured.html });
          }
        } else {
          setCachedBackground(urlKey, id, { title, html: structured.html });
        }
      } catch {
        setCachedBackground(urlKey, id, { title, html: structured.html });
      }
      return;
    }
    const res = await fetchPageContent(baseUrl, 'background', id);
    if (res.ok) {
      const title = cleanBackgroundTitle(res.titleText || displayNameFromSlug(id));
      renderCollapsible(host, title, res.contentHtml);
      setCachedBackground(urlKey, id, { title, html: res.contentHtml });
    } else {
      host.textContent = `Failed to load background: ${displayNameFromSlug(id)}`;
    }
    })();
    if (searches.length > 0) {
      const text = host.textContent?.toLowerCase() || '';
      const match = searchMode === 'and'
        ? searches.every(s => text.includes(s))
        : searches.some(s => text.includes(s));
      if (!match) host.classList.add('dnd-wiki-search-hidden');
    }
  });
  await Promise.all(tasks);
}
