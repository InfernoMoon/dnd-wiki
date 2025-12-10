import type { MarkdownPostProcessorContext } from 'obsidian';
import { getBaseUrl } from './dataService';
import { nameToSlug, fetchPageContent } from './utils';

// In-memory cache for fetched feat content by id/slug
const featCache = new Map<string, { title: string; html: string }>();


function renderFeatCard(container: HTMLElement, title: string, html: string) {
  const wrap = document.createElement('div');
  const header = document.createElement('div');
  header.className = 'page-title';
  header.textContent = title;
  const body = document.createElement('div');
  body.id = 'page-content';
  body.innerHTML = html;
  wrap.appendChild(header);
  wrap.appendChild(body);
  container.appendChild(wrap);
}

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
      const fetched = await fetchPageContent(baseUrl, 'feat', featId);
      if (fetched.ok) {
        cached = { title: fetched.titleText || featId, html: fetched.contentHtml };
        featCache.set(featId, cached);
      }
    }
    if (cached && cached.html) {
      renderFeatCard(container, cached.title, cached.html);
    } else {
      const err = document.createElement('div');
      err.textContent = `Failed to load feat: ${featId}`;
      container.appendChild(err);
    }
  }
}
