import type { MarkdownPostProcessorContext } from 'obsidian';
import { fetchPageAtUrl } from '../utils';
import { parseSectionDirectives, renderWithSections } from '../sectionRenderer';

const customPageCache = new Map<string, Map<string, { title: string; html: string }>>();

function getCacheForKey(urlKey: string): Map<string, { title: string; html: string }> {
  const existing = customPageCache.get(urlKey);
  if (existing) return existing;
  const cache = new Map<string, { title: string; html: string }>();
  customPageCache.set(urlKey, cache);
  return cache;
}

export async function renderCustom(
  source: string,
  el: HTMLElement,
  _ctx: MarkdownPostProcessorContext | undefined,
  urlKey: string,
  baseUrl: string
): Promise<void> {
  el.empty();
  if (!baseUrl) {
    el.createDiv({ text: 'Base URL is not configured.' });
    return;
  }

  const sourceMatch = /^source:\s*(.+)$/im.exec(source);
  if (!sourceMatch) {
    el.createDiv({ text: 'Provide a `source:` directive.' });
    return;
  }

  const pageSource = sourceMatch[1].trim().replace(/^\/+/, '');
  if (!pageSource) {
    el.createDiv({ text: 'Provide a non-empty `source:` directive.' });
    return;
  }

  const sourceDirectiveOffset = sourceMatch.index ?? Number.MAX_SAFE_INTEGER;
  const sectionDirectives = parseSectionDirectives(source, sourceDirectiveOffset);

  const host = el.createDiv();

  const cache = getCacheForKey(urlKey);
  const cached = cache.get(pageSource);
  if (cached) {
    renderWithSections(
      host,
      cached.title,
      cached.html,
      sectionDirectives,
      `No matching sections found in ${pageSource}`
    );
    return;
  }

  const base = baseUrl.replace(/\/$/, '');
  const result = await fetchPageAtUrl(`${base}/${pageSource}`);
  if (!result.ok) {
    host.textContent = `Failed to load source: ${pageSource}`;
    return;
  }

  const title = result.titleText || pageSource;
  cache.set(pageSource, { title, html: result.contentHtml });
  renderWithSections(
    host,
    title,
    result.contentHtml,
    sectionDirectives,
    `No matching sections found in ${pageSource}`
  );
}
