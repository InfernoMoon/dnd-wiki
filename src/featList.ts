import type { MarkdownPostProcessorContext } from 'obsidian';
import { getBaseUrl } from './dataService';
import { getKnownFeatIds } from './featUtils';
import { getCachedFeat, setCachedFeat } from './feat';
import { fetchPageContent, renderCollapsible, displayNameFromSlug } from './utils';

export async function renderFeatList(_source: string, el: HTMLElement, _ctx?: MarkdownPostProcessorContext) {
  el.empty();
  const baseUrl = await getBaseUrl();
  if (!baseUrl) {
    el.createEl('div', { text: 'Base URL is not configured.' });
    return;
  }

  const ids = getKnownFeatIds();
  if (!ids.length) {
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
