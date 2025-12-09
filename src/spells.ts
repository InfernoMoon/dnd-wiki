import { MarkdownPostProcessorContext, requestUrl } from "obsidian";
import { getBaseUrl } from "./dataService";
import { nameToSlug, displayNameFromSlug } from "./utils";

export async function renderSpell(source: string, el: HTMLElement, _ctx?: MarkdownPostProcessorContext) {
  el.empty();
  const box = el.createDiv({ cls: "dnd5e-spell-card" });

  const raw = source.trim();
  const firstLine = raw.split(/\r?\n/)[0] ?? "";
  const name = firstLine.trim();
  if (!name) {
    box.createEl("div", { text: "No spell name provided." });
    return;
  }

  const baseUrl = await getBaseUrl();
  if (!baseUrl) {
    box.createEl("div", { text: "Base URL is not configured." });
    return;
  }

  const id = nameToSlug(name);
  const { ok, titleText, contentHtml } = await fetchSpellPage(baseUrl, id);
  if (!ok) {
    // Try UA variant once
    const attempt = await fetchSpellPage(baseUrl, `${id}-ua`);
    if (!attempt.ok) {
      renderCollapsible(box, displayNameFromSlug(id) + " (Error)", "Error loading this spell");
      return;
    }
    renderCollapsible(box, attempt.titleText, attempt.contentHtml);
    return;
  }
  renderCollapsible(box, titleText, contentHtml);
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
