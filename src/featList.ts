/**
 * featList.ts
 * Renders a list of feats as collapsible cards.
 * Uses cached renders where available, prefers custom vault feats,
 * and falls back to fetching from the configured Base URL.
 */
import type { MarkdownPostProcessorContext } from 'obsidian';
import { Component, MarkdownRenderer } from 'obsidian';
import { getBaseUrl } from './dataService';
import { getKnownFeatIds } from './featUtils';
import { getCachedFeat, setCachedFeat, findCustomFeatById, buildCustomFeatHtmlStructured } from './feat';
import { fetchPageContent, renderCollapsible, displayNameFromSlug } from './utils';

/**
 * Render all known feats in the environment into the provided element.
 * If known IDs are not yet available, shows a retry message and polls for up to 30 seconds.
 * @param _source The raw block text (unused for list rendering).
 * @param el Target element to append rendered cards to.
 * @param _ctx Obsidian processor context (unused).
 */
export async function renderFeatList(_source: string, el: HTMLElement, _ctx?: MarkdownPostProcessorContext) {
  el.empty();
  const baseUrl = await getBaseUrl();
  if (!baseUrl) {
    el.createEl('div', { text: 'Base URL is not configured.' });
    return;
  }

  const ids = getKnownFeatIds();
  if (!ids.length) {
    // Preloading may be deferred; present a retry message and poll until IDs appear.
    const msg = el.createEl('div', { text: 'No feats found (preload may not have completed). Retrying…' });
    const start = Date.now();
    const intervalId = globalThis.setInterval(async () => {
      const current = getKnownFeatIds();
      if (current.length) {
        globalThis.clearInterval(intervalId);
        // Clear previous content and proceed to render
        el.empty();
        const container = document.createElement('div');
        el.appendChild(container);
        const tasks = current.map(async (id) => {
          const host = document.createElement('div');
          container.appendChild(host);
          const cached = getCachedFeat(id);
          if (cached?.html) {
            renderCollapsible(host, cached.title, cached.html);
            return;
          }
          const res = await fetchPageContent(baseUrl, 'feat', id);
          if (res.ok) {
            const title = res.titleText || displayNameFromSlug(id);
            renderCollapsible(host, title, res.contentHtml);
            setCachedFeat(id, { title, html: res.contentHtml });
          } else {
            host.textContent = `Failed to load feat: ${displayNameFromSlug(id)}`;
          }
        });
        await Promise.all(tasks);
      } else {
        // Update message every second
        const secs = Math.floor((Date.now() - start) / 1000);
        if (secs >= 30) {
          globalThis.clearInterval(intervalId);
          msg.textContent = 'No feats found after 30s. Please ensure preloading ran or reload the plugin.';
        } else {
          msg.textContent = `No feats found yet…`;
        }
      }
    }, 1000);
    return;
  }

  const container = document.createElement('div');
  el.appendChild(container);

  const tasks = ids.map(async (id) => {
    const host = document.createElement('div');
    container.appendChild(host);
    const cached = getCachedFeat(id);
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
        const app = (globalThis as unknown as { app?: import('obsidian').App }).app;
        if (structured.descMarkdown && app) {
          const mount = host.querySelector(`#${structured.descMountId}`);
          if (mount instanceof HTMLElement) {
            const component = new Component();
            await MarkdownRenderer.render(app, structured.descMarkdown, mount, file.path, component);
            setCachedFeat(id, { title, html: (mount.parentElement?.innerHTML) || structured.html });
          }
        } else {
          setCachedFeat(id, { title, html: structured.html });
        }
      } catch {
        setCachedFeat(id, { title, html: structured.html });
      }
      return;
    }
    const res = await fetchPageContent(baseUrl, 'feat', id);
    if (res.ok) {
      const title = res.titleText || displayNameFromSlug(id);
      renderCollapsible(host, title, res.contentHtml);
      setCachedFeat(id, { title, html: res.contentHtml });
    } else {
      host.textContent = `Failed to load feat: ${displayNameFromSlug(id)}`;
    }
  });
  await Promise.all(tasks);
}
