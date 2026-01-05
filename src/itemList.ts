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

// Mapping of textual rarity levels to tab indices (0-7)
const LEVEL_WORD_TO_INDEX: Record<string, number> = {
  'common': 0,
  'uncommon': 1,
  'rare': 2,
  'very-rare': 3,
  'legendary': 4,
  'artifact': 5,
  'unique': 6,
  'other': 7,
};

const LEVEL_INDEX_TO_WORD = Object.entries(LEVEL_WORD_TO_INDEX)
  .reduce<Record<number, string>>((acc, [k, v]) => { acc[v] = k; return acc; }, {});

// In-memory cache for item list results, keyed by filter combination
const itemListCache: Map<string, string[]> = new Map();

function buildCacheKey(levelDirective: LevelDirective, typeDirective: string[] | 'all' | null, attunedDirective: 'all' | boolean | null): string {
  const levelKey = Array.isArray(levelDirective)
    ? `levels:${levelDirective.join(',')}`
    : typeof levelDirective === 'number'
    ? `level:${levelDirective}`
    : levelDirective === 'all'
    ? 'level:all'
    : 'level:null';
  const typeKey = Array.isArray(typeDirective) && typeDirective.length
    ? `types:${typeDirective.slice().map(t => t.toLowerCase()).sort().join(',')}`
    : typeDirective === 'all'
    ? 'types:all'
    : 'types:null';
  const attunedKey = attunedDirective === 'all' ? 'attuned:all' : attunedDirective === true ? 'attuned:true' : attunedDirective === false ? 'attuned:false' : 'attuned:null';
  return `${levelKey}|${typeKey}|${attunedKey}`;
}

function parseLevelDirective(source: string): LevelDirective {
  const lines = source.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const m = lines.map((l) => /^level:\s*(all|[\d\s,-]+)$/i.exec(l)).find(Boolean);
  // Also match words (e.g., Common, Very-Rare) possibly comma-separated
  const mWords = m || lines.map((l) => /^level:\s*(.+)$/i.exec(l)).find(Boolean);
  if (!mWords) return null;
  const raw = (mWords![1] || '').toLowerCase().trim();
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
        } else {
          // Try word mapping (normalize spaces to '-')
          const key = tok.replace(/\s+/g, '-').toLowerCase();
          const idx = LEVEL_WORD_TO_INDEX[key];
          if (typeof idx === 'number') out.push(idx);
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

function levelIndexToName(idx: number): string {
  const w = LEVEL_INDEX_TO_WORD[idx];
  if (!w) return `${idx}`;
  // Convert back to display case: words with hyphen, capitalize each segment
  return w.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('-');
}

function buildHeading(itemLevel: number | undefined, itemLevels: number[] | undefined): string {
  if (Array.isArray(itemLevels) && itemLevels.length) return `Wondrous Items ${itemLevels.map(levelIndexToName).join(', ')}`;
  if (typeof itemLevel === 'number' && !Number.isNaN(itemLevel)) return `Wondrous Items ${levelIndexToName(itemLevel)}`;
  return 'All Wondrous Items';
}

function parseTypeDirective(source: string): string[] | 'all' | null {
  const lines = source.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const m = lines.map((l) => /^type:\s*(.+)$/i.exec(l)).find(Boolean);
  if (!m) return null;
  const raw = (m![1] || '').trim();
  if (/^all$/i.test(raw)) return 'all';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

function extractItems(root: Document | Element): Array<{ name: string; type: string; attuned: string }> {
  const rows = Array.from(root.querySelectorAll('table tr'));
  const out: Array<{ name: string; type: string; attuned: string }> = [];
  for (const tr of rows) {
    const tds = Array.from(tr.querySelectorAll('td'));
    const nameIdx = tds.findIndex((td) => !!td.querySelector('a[href]'));
    if (nameIdx === -1) continue;
    const anchor = tds[nameIdx].querySelector('a[href]') as HTMLAnchorElement | null;
    const name = (anchor?.textContent || '').trim();
    if (!name) continue;
    // Type is in the immediate next td after the name td (i+1)
    const typeTd = tds[nameIdx + 1] || null;
    const type = (typeTd?.textContent || '').trim();
    // Attuned column is the next after type (i+2)
    const attunedTd = tds[nameIdx + 2] || null;
    const attuned = (attunedTd?.textContent || '').trim();
    out.push({ name, type, attuned });
  }
  return out;
}

export async function renderItemList(source: string, el: HTMLElement, _ctx?: MarkdownPostProcessorContext) {
  el.empty();
  const baseUrl = await getBaseUrl();
  if (!baseUrl) {
    el.createEl('div', { text: 'Base URL is not configured.' });
    return;
  }

  // Parse directives up front (for cache key and heading)
  const levelDirective = parseLevelDirective(source);
  const itemLevel = typeof levelDirective === 'number' ? levelDirective : undefined;
  const itemLevels = Array.isArray(levelDirective) ? levelDirective : undefined;
  const typeDirective = parseTypeDirective(source);
  const attunedDirective = parseAttunedDirective(source);

  // Try cache
  const cacheKey = buildCacheKey(levelDirective, typeDirective, attunedDirective);
  let names = itemListCache.get(cacheKey);
  if (names) {
    // Render from cache
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
    return;
  }

  const base = baseUrl.replace(/\/$/, '');
  names = [];
  let items: Array<{ name: string; type: string; attuned: string }> = [];
  let doc: Document | null = null;
  try {
    const res = await requestUrl({ url: `${base}/wondrous-items`, method: 'GET' });
    if (res.status >= 200 && res.status < 300) {
      const parser = new DOMParser();
      doc = parser.parseFromString(res.text, 'text/html');
      items = extractItems(doc);
      names = items.map((i) => i.name);
    }
  } catch {
    // ignore
  }
  if (doc) {
    const levelResult = applyLevelFilters(doc, names, itemLevel, itemLevels);
    if (!levelResult.ok) {
      el.setText(levelResult.message || 'No Wondrous Items found');
      return;
    }
    names = levelResult.names;
  }

  // Apply type filter after level filters using extracted items
  if (typeDirective && typeDirective !== 'all' && items.length) {
    const typeSet = new Set(typeDirective.map((t) => t.toLowerCase()));
    const typeBySlug = new Map<string, string>();
    for (const it of items) {
      const slug = nameToSlug(it.name);
      typeBySlug.set(slug, (it.type || '').trim().toLowerCase());
    }
    names = names.filter((n) => {
      const slug = nameToSlug(n);
      const t = typeBySlug.get(slug) || '';
      return t.length > 0 && typeSet.has(t);
    });
  }

  // Apply attuned filter: attuned: all | true | false
  function parseAttunedDirective(sourceText: string): 'all' | boolean | null {
    const lines = sourceText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const m = lines.map((l) => /^attuned:\s*(all|true|false|required|not-required)$/i.exec(l)).find(Boolean);
    if (!m) return null;
    const v = (m![1] || '').toLowerCase().trim();
    if (v === 'all') return 'all';
    if (v === 'true' || v === 'required') return true;
    if (v === 'false' || v === 'not-required') return false;
    return null;
  }
  if (attunedDirective !== null && attunedDirective !== 'all' && items.length) {
    const attunedBySlug = new Map<string, boolean>();
    for (const it of items) {
      const slug = nameToSlug(it.name);
      const flag = /attuned/i.test(it.attuned || '');
      attunedBySlug.set(slug, flag);
    }
    names = names.filter((n) => {
      const slug = nameToSlug(n);
      const flag = attunedBySlug.get(slug) || false;
      return attunedDirective ? flag === true : flag !== true;
    });
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
  // Save to cache
  itemListCache.set(cacheKey, names);
}
