import type { MarkdownPostProcessorContext } from 'obsidian';
import { requestUrl } from 'obsidian';
import { getBaseUrl } from './dataService';
import { nameToSlug, displayNameFromSlug, fetchPageContent, renderCollapsible } from './utils';

function extractNames(root: Document | Element): string[] {
  // Only include items that have an anchor with an href in the table
  const anchors = Array.from(root.querySelectorAll('table tr td a[href]')) as HTMLAnchorElement[];
  return anchors
    .map((a) => (a.textContent || '').trim())
    .filter((t) => t.length > 0);
}

type LevelDirective = number | number[] | 'all' | null;

function parseLevelDirective(source: string): LevelDirective {
  const lines = source.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const m = lines.map((l) => /^level:\s*(all|[\d\s,-]+)$/i.exec(l)).find(Boolean);
  if (!m) return null;
  const raw = (m![1] || '').toLowerCase().trim();
  if (raw === 'all') return 'all';
  const expand = (txt: string): number[] => {
    const out: number[] = [];
    const tokens = txt.split(',').map((s) => s.trim()).filter(Boolean);
    for (const tok of tokens) {
      if (/^\d+$/.test(tok)) {
        const n = Number.parseInt(tok, 10);
        if (!Number.isNaN(n) && n >= 0 && n <= 7) out.push(n);
      } else {
        const mm = /^(\d+)\s*-\s*(\d+)$/.exec(tok);
        if (mm) {
          const a = Number.parseInt(mm[1], 10);
          const b = Number.parseInt(mm[2], 10);
          if (!Number.isNaN(a) && !Number.isNaN(b)) {
            const start = Math.max(0, Math.min(a, b));
            const end = Math.min(7, Math.max(a, b));
            for (let i = start; i <= end; i++) out.push(i);
          }
        }
      }
    }
    return Array.from(new Set(out)).sort((x, y) => x - y);
  };
  const parts = expand(raw);
  return parts.length <= 1 ? (parts[0] ?? null) : parts;
}

function applyLevelFilters(baseDoc: Document, names: string[], itemLevel?: number, itemLevels?: number[]): { ok: boolean; names: string[]; message?: string } {
  if (Array.isArray(itemLevels) && itemLevels.length) {
    const unionLevelSet = new Set<string>();
    for (const lvl of itemLevels) {
      const tabEl = baseDoc.querySelector(`#wiki-tab-0-${lvl}`);
      if (!tabEl) continue;
      const levelNames = extractNames(tabEl);
      for (const n of levelNames) unionLevelSet.add(nameToSlug(n));
    }
    if (!unionLevelSet.size) {
      return { ok: false, names: [], message: `No Wondrous Items found for levels ${itemLevels.join(',')}` };
    }
    return { ok: true, names: names.filter((n) => unionLevelSet.has(nameToSlug(n))) };
  }
  if (typeof itemLevel === 'number' && !Number.isNaN(itemLevel)) {
    const tabEl = baseDoc.querySelector(`#wiki-tab-0-${itemLevel}`);
    if (!tabEl) {
      return { ok: false, names: [], message: `No Wondrous Items found for level ${itemLevel}` };
    }
    const levelNames = extractNames(tabEl);
    const setLevel = new Set(levelNames.map((n) => nameToSlug(n)));
    return { ok: true, names: names.filter((n) => setLevel.has(nameToSlug(n))) };
  }
  return { ok: true, names };
}

function buildHeading(itemLevel: number | undefined, itemLevels: number[] | undefined): string {
  if (Array.isArray(itemLevels) && itemLevels.length) return `Wondrous Items Level ${itemLevels.join(', ')}`;
  if (typeof itemLevel === 'number' && !Number.isNaN(itemLevel)) return `Wondrous Items Level ${itemLevel}`;
  return 'All Wondrous Items';
}

export async function renderItemList(source: string, el: HTMLElement, _ctx?: MarkdownPostProcessorContext) {
  el.empty();
  const baseUrl = await getBaseUrl();
  if (!baseUrl) {
    el.createEl('div', { text: 'Base URL is not configured.' });
    return;
  }

  const base = baseUrl.replace(/\/$/, '');
  let names: string[] = [];
  let doc: Document | null = null;
  try {
    const res = await requestUrl({ url: `${base}/wondrous-items`, method: 'GET' });
    if (res.status >= 200 && res.status < 300) {
      const parser = new DOMParser();
      doc = parser.parseFromString(res.text, 'text/html');
      names = extractNames(doc);
    }
  } catch {
    // ignore
  }

  const levelDirective = parseLevelDirective(source);
  const itemLevel = typeof levelDirective === 'number' ? levelDirective : undefined;
  const itemLevels = Array.isArray(levelDirective) ? levelDirective : undefined;

  if (doc) {
    const levelResult = applyLevelFilters(doc, names, itemLevel, itemLevels);
    if (!levelResult.ok) {
      el.setText(levelResult.message || 'No Wondrous Items found');
      return;
    }
    names = levelResult.names;
  }

  if (!names.length) {
    el.setText('No Wondrous Items found');
    return;
  }

  const container = document.createElement('div');
  const heading = buildHeading(itemLevel, itemLevels);
  const h2 = document.createElement('h2');
  h2.style.margin = '0 0 0.5em 0';
  h2.textContent = heading;
  el.appendChild(h2);
  el.appendChild(container);

  const tasks = names.map(async (name) => {
    const host = document.createElement('div');
    container.appendChild(host);
    const id = nameToSlug(name);
    const res = await fetchPageContent(baseUrl, 'wondrous-items', id);
    if (res.ok) {
      const title = res.titleText || displayNameFromSlug(id);
      renderCollapsible(host, title, res.contentHtml);
    } else {
      host.textContent = `Failed to load item: ${displayNameFromSlug(id)}`;
    }
  });
  await Promise.all(tasks);
}
