/**
 * featList.ts
 * Renders a list of feats as collapsible cards.
 * Uses cached renders where available, prefers custom vault feats,
 * and falls back to fetching from the configured Base URL.
 */
import { Component, MarkdownRenderer } from 'obsidian';
import { getKnownFeatIdsForKey } from './featUtils';
import { getCachedFeat, setCachedFeat, findCustomFeatById, buildCustomFeatHtmlStructured } from './feat';
import { fetchPageContent, getObsidianApp, renderCollapsible, displayNameFromSlug, parseSearchDirective, parseSearchModeDirective } from '../utils';

export async function renderFeatList(source: string, el: HTMLElement, _ctx: import('obsidian').MarkdownPostProcessorContext | undefined, urlKey: string, baseUrl: string) {
  el.empty();
  if (!baseUrl) {
    el.createEl('div', { text: 'Base URL is not configured.' });
    return;
  }
  const searches = parseSearchDirective(source);
  const searchMode = parseSearchModeDirective(source);

  const ids = getKnownFeatIdsForKey(urlKey);
  if (!ids.length) {
    // Preloading may be deferred; present a retry message and poll until IDs appear.
    const msg = el.createEl('div', { text: 'No feats found (preload may not have completed). Retrying…' });
    const start = Date.now();
    const intervalId = window.setInterval(async () => {
      const current = getKnownFeatIdsForKey(urlKey);
      if (current.length) {
        window.clearInterval(intervalId);
        // Clear previous content and proceed to render
        el.empty();
        const container = el.createDiv();
        const tasks = current.map(async (id) => {
          const host = container.createDiv();
          const cached = getCachedFeat(urlKey, id);
          if (cached?.html) {
            renderCollapsible(host, cached.title, cached.html);
            return;
          }
          const res = await fetchPageContent(baseUrl, 'feat', id);
          if (res.ok) {
            const title = res.titleText || displayNameFromSlug(id);
            renderCollapsible(host, title, res.contentHtml);
            setCachedFeat(urlKey, id, { title, html: res.contentHtml });
          } else {
            host.textContent = `Failed to load feat: ${displayNameFromSlug(id)}`;
          }
        });
        await Promise.all(tasks);
      } else {
        // Update message every second
        const secs = Math.floor((Date.now() - start) / 1000);
        if (secs >= 30) {
          window.clearInterval(intervalId);
          msg.textContent = 'No feats found after 30s. Please ensure preloading ran or reload the plugin.';
        } else {
          msg.textContent = `No feats found yet…`;
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
    const cached = getCachedFeat(urlKey, id);
    if (cached?.html) {
      renderCollapsible(host, cached.title, cached.html);
      return;
    }
    // Try custom feat first, else fetch from base URL
    const custom = await findCustomFeatById(id);
    if (custom) {
      const { file, title, content } = custom;
      const uid = Math.random().toString(36).slice(2, 11);
      const structured = buildCustomFeatHtmlStructured(content, title, uid);
      renderCollapsible(host, title, structured.html);
      try {
        const app = getObsidianApp();
        if (structured.descMarkdown && app) {
          const mount = host.querySelector(`#${structured.descMountId}`);
          if (mount instanceof HTMLElement) {
            const component = new Component();
            await MarkdownRenderer.render(app, structured.descMarkdown, mount, file.path, component);
            setCachedFeat(urlKey, id, { title, html: (mount.parentElement?.innerHTML) || structured.html });
          }
        } else {
          setCachedFeat(urlKey, id, { title, html: structured.html });
        }
      } catch {
        setCachedFeat(urlKey, id, { title, html: structured.html });
      }
      return;
    }
    const res = await fetchPageContent(baseUrl, 'feat', id);
    if (res.ok) {
      const title = res.titleText || displayNameFromSlug(id);
      renderCollapsible(host, title, res.contentHtml);
      setCachedFeat(urlKey, id, { title, html: res.contentHtml });
    } else {
      host.textContent = `Failed to load feat: ${displayNameFromSlug(id)}`;
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
