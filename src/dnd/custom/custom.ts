import type { MarkdownPostProcessorContext } from 'obsidian';
import { RenderCache } from '../../cache/renderCache';
import type { CachedRender } from '../../cache/renderCache';
import { fetchPageAtUrl } from '../../utils/wikiPageFetcher';
import { requireBaseUrl } from '../../utils/renderer';
import { parseSectionDirectives, renderWithSections } from '../../utils/sectionRenderer';

const customRenderCache = new RenderCache<CachedRender>();

async function ensureCustomCached(
	pageSource: string,
	urlKey: string,
	baseUrl: string,
): Promise<CachedRender | null> {
	const existing = customRenderCache.get(urlKey, pageSource);
	if (existing) return existing;

	const base = baseUrl.replace(/\/$/, '');
	const result = await fetchPageAtUrl(`${base}/${pageSource}`);
	if (!result.ok) return null;

	const cached: CachedRender = {
		title: result.titleText || pageSource,
		html: result.contentHtml,
	};
	customRenderCache.set(urlKey, pageSource, cached);
	return cached;
}

export async function renderCustom(
  source: string,
  el: HTMLElement,
  _ctx: MarkdownPostProcessorContext | undefined,
  urlKey: string,
  baseUrl: string
): Promise<void> {
  el.empty();
  if (!requireBaseUrl(el, baseUrl)) return;

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
  const cached = await ensureCustomCached(pageSource, urlKey, baseUrl);
  if (!cached) {
    host.textContent = `Failed to load source: ${pageSource}`;
    return;
  }

  renderWithSections(
    host,
    cached.title,
    cached.html,
    sectionDirectives,
    `No matching sections found in ${pageSource}`
  );
}
