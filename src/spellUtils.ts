import { requestUrl } from "obsidian";
import { nameToSlug, displayNameFromSlug } from "./utils";

// In-memory cache of rendered spell content, keyed by normalized id
const spellRenderCache: Map<string, { titleText: string; contentHtml: string }> = new Map();

export async function renderSingleSpell(host: HTMLElement, baseUrl: string, name: string) {
  const id = nameToSlug(name);
  if (!id) {
    host.createEl('div', { text: 'No spell name provided' });
    return;
  }
  // If already rendered and cached, reuse without refetching
  const cached = spellRenderCache.get(id);
  if (cached) {
    renderCollapsible(host, cached.titleText, cached.contentHtml);
    return;
  }
  try {
    let result = await fetchSpellPage(baseUrl, id);
    if (!result.ok) {
      // Try UA variant once
      result = await fetchSpellPage(baseUrl, `${id}-ua`);
    }
    if (!result.ok) {
      renderCollapsible(host, displayNameFromSlug(id) + ' (Error)', 'Error loading this spell');
      return;
    }
    spellRenderCache.set(id, { titleText: result.titleText, contentHtml: result.contentHtml });
    renderCollapsible(host, result.titleText, result.contentHtml);
  } catch (e) {
    console.error('Failed to render spell', { name, id, error: e });
    renderCollapsible(host, displayNameFromSlug(id) + ' (Error)', 'Error loading this spell');
  }
}

async function fetchSpellPage(baseUrl: string, id: string): Promise<{ ok: boolean; titleText: string; contentHtml: string }> {
  const base = baseUrl.replace(/\/$/, "");
  const url = `${base}/spell:${id}`;
  const res = await requestUrl({ url, method: 'GET' });
  if (res.status < 200 || res.status >= 300) return { ok: false, titleText: "", contentHtml: "" };
  const html = res.text;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const titleEl = doc.querySelector('.page-title.page-header');
  const contentEl = doc.querySelector('#page-content');
  const titleText = titleEl ? (titleEl.textContent || '') : '';
  const missing = titleText.toLowerCase().includes('the page does not') || !titleEl || !contentEl;
  if (missing) return { ok: false, titleText: "", contentHtml: "" };

  // sanitize: replace anchors with spans
  const contentClone = contentEl.cloneNode(true) as HTMLElement;
  const links = contentClone.querySelectorAll('a');
  for (const a of Array.from(links)) {
    const span = doc.createElement('span');
    span.textContent = a.textContent || '';
    a.replaceWith(span);
  }
  return { ok: true, titleText, contentHtml: contentClone.innerHTML };
}

function renderCollapsible(el: HTMLElement, title: string, html: string) {
  const contentDivId = `spell-content-${Math.random().toString(36).slice(2, 11)}`;
  const arrowId = `spell-arrow-${Math.random().toString(36).slice(2, 11)}`;
  el.innerHTML = `
    <div style="display:flex; align-items:center; cursor:pointer;" id="title-${contentDivId}">
      <span style="margin-right:0.5em;" id="${arrowId}">▼</span>
      <span style="font-size: 1.1em; font-weight: 600; margin:0;">${title}</span>
    </div>
    <div id="${contentDivId}" style="display:none; margin-top:0.5em;">${html}</div>
  `;
  const titleDiv = el.querySelector(`#title-${contentDivId}`);
  const contentDiv = el.querySelector(`#${contentDivId}`);
  const arrow = el.querySelector(`#${arrowId}`);
  if (!titleDiv || !contentDiv || !arrow) return;
  titleDiv.addEventListener('click', () => {
    const c = contentDiv as HTMLElement;
    const a = arrow as HTMLElement;
    const isHidden = c.style.display === 'none';
    c.style.display = isHidden ? 'block' : 'none';
    a.textContent = isHidden ? '▲' : '▼';
  });
}
