import type { MarkdownPostProcessorContext } from 'obsidian';
import { requestUrl, TFolder, TAbstractFile, TFile, MarkdownRenderer, Component } from 'obsidian';
import { getObsidianApp, nameToSlug, displayNameFromSlug, fetchPageContent, renderCollapsible, extractTableNamesFromFirstCell, parseSearchDirective, parseSearchModeDirective } from '../utils';
import { STATIC_ITEM_RARITY_WORD_TO_INDEX } from '../data/staticData';
import { getCachedItem, setCachedItem } from './item';

// Use shared extractor to match spell list behavior

type LevelDirective = number | number[] | 'all' | null;

// Mapping of textual rarity levels to tab indices (0-7)
const LEVEL_INDEX_TO_WORD = Object.entries(STATIC_ITEM_RARITY_WORD_TO_INDEX)
  .reduce<Record<number, string>>((acc, [k, v]) => { acc[v] = k; return acc; }, {});

// In-memory cache for item list results, keyed by filter combination
const itemListCache: Map<string, string[]> = new Map();

function buildCacheKey(urlKey: string, levelDirective: LevelDirective, typeDirective: string[] | 'all' | null, attunedDirective: 'all' | boolean | null): string {
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
  return `${urlKey}|${levelKey}|${typeKey}|${attunedKey}`;
}

function parseLevelDirective(source: string): LevelDirective {
  const lines = source.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const m = lines.map((l) => /^level:\s*(all|[\d\s,-]+)$/i.exec(l)).find(Boolean);
  // Also match words (e.g., Common, Very-Rare) possibly comma-separated
  const mWords = m || lines.map((l) => /^level:\s*(.+)$/i.exec(l)).find(Boolean);
  if (!mWords) return null;
  const raw = (mWords[1] || '').toLowerCase().trim();
  if (raw === 'all') return 'all';
  const expand = (txt: string): number[] => {
    const out: number[] = [];
    const tokens = txt.split(',').map((s) => s.trim()).filter(Boolean);
    for (const tok of tokens) {
      if (/^\d+$/.test(tok)) {
        /**
         * itemList.ts
         * Markdown code block processor for ```dnd-itemlist blocks.
         * Fetches the Wondrous Items index page, applies filters (level/type/attuned),
         * and renders matching items as collapsible cards. Results are cached by filter.
         */
        const n = Number.parseInt(tok, 10);
        if (!Number.isNaN(n) && n >= 0 && n <= 7) out.push(n);
      } else {
        const mm = /^(\d+)\s*-\s*(\d+)$/.exec(tok);
        if (mm) {
          const a = Number.parseInt(mm[1], 10);
        /**
         * Extract non-empty names from the first cell of table rows.
         * Delegates to shared utils to stay in sync with spell list behavior.
         */
          const b = Number.parseInt(mm[2], 10);
          if (!Number.isNaN(a) && !Number.isNaN(b)) {
            const start = Math.max(0, Math.min(a, b));
            const end = Math.min(7, Math.max(a, b));
            for (let i = start; i <= end; i++) out.push(i);
          }
        } else {
          // Try word mapping (normalize spaces to '-')
          const key = tok.replace(/\s+/g, '-').toLowerCase();
          const idx = STATIC_ITEM_RARITY_WORD_TO_INDEX[key];
          if (typeof idx === 'number') out.push(idx);
        }
      }
    }
    return Array.from(new Set(out)).sort((x, y) => x - y);
  };
  const parts = expand(raw);
        /**
         * Compute a stable cache key for the combination of filters.
         */
  return parts.length <= 1 ? (parts[0] ?? null) : parts;
}

function applyLevelFilters(baseDoc: Document, names: string[], itemLevel?: number, itemLevels?: number[]): { ok: boolean; names: string[]; message?: string } {
  if (Array.isArray(itemLevels) && itemLevels.length) {
    const unionLevelSet = new Set<string>();
    for (const lvl of itemLevels) {
      const tabEl = baseDoc.querySelector(`#wiki-tab-0-${lvl}`);
      if (!tabEl) continue;
      const levelNames = extractTableNamesFromFirstCell(tabEl);
      for (const n of levelNames) unionLevelSet.add(nameToSlug(n));
    }
    if (!unionLevelSet.size) {
      return { ok: false, names: [], message: `No Wondrous Items found for levels ${itemLevels.join(',')}` };
    }
    return { ok: true, names: names.filter((n) => unionLevelSet.has(nameToSlug(n))) };
  }
        /**
         * Parse `level:` directive into a numeric index or list of indices (0-7),
         * or the string 'all', or null if absent/invalid.
         */
  if (typeof itemLevel === 'number' && !Number.isNaN(itemLevel)) {
    const tabEl = baseDoc.querySelector(`#wiki-tab-0-${itemLevel}`);
    if (!tabEl) {
      return { ok: false, names: [], message: `No Wondrous Items found for level ${itemLevel}` };
    }
    const levelNames = extractTableNamesFromFirstCell(tabEl);
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
  const raw = (m[1] || '').trim();
  if (/^all$/i.test(raw)) return 'all';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, '-'))
    .filter((s) => s.length > 0);
}

function extractItems(root: Document | Element): Array<{ name: string; type: string; attuned: string }> {
  const rows = Array.from(root.querySelectorAll('table tr'));
        /**
         * Intersect current names with names present under the selected rarity tabs.
         */
  const out: Array<{ name: string; type: string; attuned: string }> = [];
  for (const tr of rows) {
    const tds = Array.from(tr.querySelectorAll('td'));
    const nameIdx = tds.findIndex((td) => !!td.querySelector('a[href]'));
    if (nameIdx === -1) continue;
    const anchor = tds[nameIdx].querySelector('a[href]');
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

// ---------------------------
// Custom item support
// ---------------------------

function escapeHtml(s: string): string {
  return s
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;');
}

function capitalizeWords(s?: string): string {
  if (!s) return '';
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function normalizeSpaces(s: string): string {
  return s.replace(/\u00A0/g, ' ').trim();
}

function parseCustomItemMeta(raw: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);
  let collectingKey: string | null = null;
  let collectingBuf: string[] = [];
  const finishCollect = () => {
    if (collectingKey) {
      meta[collectingKey] = collectingBuf.join('\n');
    }
    collectingKey = null;
    collectingBuf = [];
  };
  for (const element of lines) {
    const rawLine = element;
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (collectingKey) {
      const endsWithQuote = /"\s*$/.test(trimmed);
      if (endsWithQuote) {
        const body = trimmed.replace(/"\s*$/, '');
        collectingBuf.push(body);
        finishCollect();
      } else {
        collectingBuf.push(trimmed);
      }
      continue;
    }
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).toLowerCase().trim().replace(/\s+/g, '-');
    let value = trimmed.slice(idx + 1).trim();
    if (/^"/.test(value)) {
      value = value.replace(/^"/, '');
      const endsSameLine = /"\s*$/.test(value);
      if (endsSameLine) {
        meta[key] = value.replace(/"\s*$/, '');
      } else {
        collectingKey = key;
        collectingBuf = [value];
      }
    } else {
      meta[key] = value;
    }
  }
  if (collectingKey) finishCollect();
  return meta;
}

function buildCustomItemHtmlStructured(content: string, title: string, uid: string): { html: string; descMarkdown: string | null; descMountId: string } {
  const meta = parseCustomItemMeta(content);
  const type = meta['type'] ? capitalizeWords(normalizeSpaces(meta['type'])) : '';
  const level = meta['level'] ? capitalizeWords(normalizeSpaces(meta['level'])) : '';
  const attuned = meta['attuned'] ? capitalizeWords(normalizeSpaces(meta['attuned'])) : '';
  const descriptionRaw = meta['description'] || '';

  const parts: string[] = [];
  const spacer = '<div class="dnd-wiki-section-spacer"></div>';
  parts.push('<div>Source: Custom</div>');
  parts.push(spacer);
  if (type) parts.push(`<div><strong>Type:</strong> ${escapeHtml(type)}</div>`);
  if (level) parts.push(`<div><strong>Rarity:</strong> ${escapeHtml(level)}</div>`);
  if (attuned) parts.push(`<div><strong>Attunement:</strong> ${escapeHtml(attuned)}</div>`);
  if (type || level || attuned) parts.push(spacer);
  const descMountId = `desc-${uid}`;
  if (descriptionRaw) {
    parts.push(`<div id="${descMountId}" class="dnd-wiki-description-mount"></div>`);
    parts.push(spacer);
  }
  return { html: parts.join(''), descMarkdown: descriptionRaw || null, descMountId };
}

async function findCustomItemById(id: string): Promise<{ file: TFile; title: string; content: string } | null> {
  try {
    const app = getObsidianApp();
    const vault = app?.vault;
    const folderPath = 'DnD-Cards/Items';
    const folder = vault?.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return null;
    const children: TAbstractFile[] = folder.children;
    for (const child of children) {
      if (child instanceof TFile && child.extension?.toLowerCase() === 'md') {
        const baseName: string = child.basename || child.name.replace(/\.md$/i, '');
        if (nameToSlug(baseName) === id) {
          if (!vault) return null;
          const content = await vault.read(child);
          const title = baseName;
          return { file: child, title, content };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function extractCustomItems(): Promise<Array<{ name: string; type: string; attuned: string; levelIdx: number | null }>> {
  const out: Array<{ name: string; type: string; attuned: string; levelIdx: number | null }> = [];
  try {
    const app = getObsidianApp();
    const vault = app?.vault;
    const folderPath = 'DnD-Cards/Items';
    const folder = vault?.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder) || !vault) return out;
    for (const child of folder.children) {
      if (child instanceof TFile && child.extension?.toLowerCase() === 'md') {
        const baseName: string = child.basename || child.name.replace(/\.md$/i, '');
        const raw = await vault.read(child);
        const meta = parseCustomItemMeta(raw);
        const type = (meta['type'] || '').trim();
        const attunedRaw = (meta['attuned'] || '').trim().toLowerCase();
        const attuned = (attunedRaw === 'required' || attunedRaw === 'true') ? 'Attuned' : '';
        const levelWord = (meta['level'] || '').trim().toLowerCase().replace(/\s+/g, '-');
        const levelIdx = typeof STATIC_ITEM_RARITY_WORD_TO_INDEX[levelWord] === 'number' ? STATIC_ITEM_RARITY_WORD_TO_INDEX[levelWord] : null;
        out.push({ name: baseName, type, attuned, levelIdx });
      }
    }
  } catch {
    // ignore
  }
  return out;
}

// Parse `attuned:` directive into 'all' | true | false | null at module scope
function parseAttunedDirective(sourceText: string): 'all' | boolean | null {
  const lines = sourceText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const m = lines.map((l) => /^attuned:\s*(all|true|false|required|not-required)$/i.exec(l)).find(Boolean);
  if (!m) return null;
  const v = (m[1] || '').toLowerCase().trim();
  if (v === 'all') return 'all';
  if (v === 'true' || v === 'required') return true;
  if (v === 'false' || v === 'not-required') return false;
  return null;
}

export async function renderItemList(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext | undefined, urlKey: string, baseUrl: string) {
  el.empty();
  if (!baseUrl) {
    el.createDiv({ text: 'Base URL is not configured.' });
    return;
  }
        /**
         * Convert a rarity index to a display name (Title-Case, hyphenated).
         */

  // Parse directives up front (for cache key and heading)
  const levelDirective = parseLevelDirective(source);
  const itemLevel = typeof levelDirective === 'number' ? levelDirective : undefined;
  const itemLevels = Array.isArray(levelDirective) ? levelDirective : undefined;
  const typeDirective = parseTypeDirective(source);
  const attunedDirective = parseAttunedDirective(source);
  const searches = parseSearchDirective(source);
  const searchMode = parseSearchModeDirective(source);
        /**
         * Build the H2 heading shown above the rendered list.
         */

  // Try cache
  const cacheKey = buildCacheKey(urlKey, levelDirective, typeDirective, attunedDirective);
  let names = itemListCache.get(cacheKey);
  if (names) {
    // Render from cache
        /**
         * Parse `type:` directive into lowercased list, 'all', or null.
         */
    if (!names.length) {
      el.setText('No Wondrous Items found');
      return;
    }
    const heading = buildHeading(itemLevel, itemLevels);
    el.createEl('h2', { cls: 'dnd-wiki-list-heading', text: heading });
    const container = el.createDiv();
    const tasks = names.map(async (name) => {
        /**
         * Extract full item rows with name/type/attuned parsed from the table.
         */
      const host = container.createDiv();
      const id = nameToSlug(name);
      const itemPageType = baseUrl.includes('2024') ? 'magic-item' : 'wondrous-items';
      const cachedItem = getCachedItem(urlKey, id);
      if (cachedItem) {
        renderCollapsible(host, cachedItem.title, cachedItem.html);
      } else {
        const res = await fetchPageContent(baseUrl, itemPageType, id);
        if (res.ok) {
          const title = res.titleText || displayNameFromSlug(id);
          setCachedItem(urlKey, id, { title, html: res.contentHtml });
          renderCollapsible(host, title, res.contentHtml);
        } else {
          host.textContent = `Failed to load item: ${displayNameFromSlug(id)}`;
        }
      }
      if (searches.length > 0) {
        const text = host.textContent?.toLowerCase() || '';
        const match = searchMode === 'and'
          ? searches.every(s => text.includes(s))
          : searches.some(s => text.includes(s));
        if (!match) host.classList.add('dnd-wiki-search-hidden');
      }
    });
    await Promise.all(tasks);
    return;
  }

  const base = baseUrl.replace(/\/$/, '');
  names = [];
  let items: Array<{ name: string; type: string; attuned: string }> = [];
  let customItems: Array<{ name: string; type: string; attuned: string; levelIdx: number | null }> = [];
  let doc: Document | null = null;
  const indexPath = baseUrl.includes('2024') ? '/magic-item:all' : '/wondrous-items';
  try {
    const res = await requestUrl({ url: `${base}${indexPath}`, method: 'GET' });
    if (res.status >= 200 && res.status < 300) {
      const parser = new DOMParser();
      doc = parser.parseFromString(res.text, 'text/html');
      items = extractItems(doc);
    }
  } catch {
    // ignore
  }
  // Load custom items from vault
  customItems = await extractCustomItems();
  items.push(...customItems.map(ci => ({ name: ci.name, type: ci.type, attuned: ci.attuned })));
  names = items.map((i) => i.name);

  if (doc) {
    // Apply level filters to remote items via DOM tabs
    const remoteNames = extractItems(doc).map(i => i.name);
    const levelResult = applyLevelFilters(doc, remoteNames, itemLevel, itemLevels);
    const filteredNames = levelResult.ok ? levelResult.names : [];
    // Apply level filters to custom items by levelIdx
    let customEligible: string[] = [];
    if (Array.isArray(itemLevels) && itemLevels.length) {
      const setLvls = new Set(itemLevels);
      for (const customItem of customItems) {
        const { levelIdx } = customItem;
        if (levelIdx !== null && setLvls.has(levelIdx)) {
          customEligible.push(customItem.name);
        }
      }
    } else if (typeof itemLevel === 'number' && !Number.isNaN(itemLevel)) {
      customEligible = customItems.filter(ci => ci.levelIdx === itemLevel).map(ci => ci.name);
    } else {
      // level: all or null => include all custom
      customEligible = customItems.map(ci => ci.name);
    }
    names = Array.from(new Set([ ...filteredNames, ...customEligible ]));
    if (!names.length) {
      el.setText(levelResult.message || 'No Wondrous Items found');
      return;
    }
  }

  // Apply type filter after level filters using extracted items
  if (typeDirective && typeDirective !== 'all' && items.length) {
    const typeSet = new Set(typeDirective.map((t) => t.toLowerCase().replace(/\s+/g, '-')));
    const typeBySlug = new Map<string, string>();
    for (const it of items) {
      const slug = nameToSlug(it.name);
      typeBySlug.set(slug, (it.type || '').trim().toLowerCase().replace(/\s+/g, '-'));
    }
    names = names.filter((n) => {
      const slug = nameToSlug(n);
      const t = typeBySlug.get(slug) || '';
      return t.length > 0 && typeSet.has(t);
    });
  }

  // Apply attuned filter: attuned: all | true | false
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

  // Apply search filter (already parsed above)

  const heading = buildHeading(itemLevel, itemLevels);
  el.createEl('h2', { cls: 'dnd-wiki-list-heading', text: heading });
  const container = el.createDiv();

  const tasks = names.map(async (name) => {
    const host = container.createDiv();
    const id = nameToSlug(name);
    await (async () => {
    // Try custom first
    const custom = await findCustomItemById(id);
    if (custom) {
      const { file, title, content } = custom;
      const uid = Math.random().toString(36).slice(2, 11);
      const structured = buildCustomItemHtmlStructured(content, title, uid);
      renderCollapsible(host, title, structured.html);
      if (structured.descMarkdown) {
        try {
          const app = getObsidianApp();
          if (app) {
            const mount = host.querySelector(`#${structured.descMountId}`);
            if (mount instanceof HTMLElement) {
              const component = new Component();
              await MarkdownRenderer.render(app, structured.descMarkdown, mount, file.path, component);
            }
          }
        } catch {
          // ignore
        }
      }
      return;
    }
    // Fallback to remote item
    const itemPageType2 = baseUrl.includes('2024') ? 'magic-item' : 'wondrous-items';
    const cachedItem2 = getCachedItem(urlKey, id);
    if (cachedItem2) {
      renderCollapsible(host, cachedItem2.title, cachedItem2.html);
    } else {
      const res = await fetchPageContent(baseUrl, itemPageType2, id);
      if (res.ok) {
        const title = res.titleText || displayNameFromSlug(id);
        setCachedItem(urlKey, id, { title, html: res.contentHtml });
        renderCollapsible(host, title, res.contentHtml);
      } else {
        host.textContent = `Failed to load item: ${displayNameFromSlug(id)}`;
      }
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
  // Save to cache
  itemListCache.set(cacheKey, names);
}
