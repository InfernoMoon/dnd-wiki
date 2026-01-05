import { requestUrl } from 'obsidian';
import { nameToSlug } from './utils';

// In-memory set of all known wondrous item ids (normalized slugs)
const itemIdCache: Set<string> = new Set();
// In-memory map of item types (case-insensitive key -> original display value)
const itemTypeCache: Map<string, string> = new Map();

export function getKnownItemIds(): string[] {
  return Array.from(itemIdCache).sort((a, b) => a.localeCompare(b));
}

export function getCachedItemTypes(): string[] {
  return Array.from(itemTypeCache.values()).sort((a, b) => a.localeCompare(b));
}

export async function preloadAllItemIds(baseUrl: string): Promise<void> {
  const base = baseUrl.replace(/\/$/, '');
  try {
    const res = await requestUrl({ url: `${base}/wondrous-items`, method: 'GET' });
    if (res.status < 200 || res.status >= 300) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(res.text, 'text/html');
    const rows = Array.from(doc.querySelectorAll('table tr'));
    for (const tr of rows) {
      const tds = Array.from(tr.querySelectorAll('td'));
      const nameTdIdx = tds.findIndex((td) => !!td.querySelector('a[href]'));
      if (nameTdIdx === -1) continue;
      const anchor = tds[nameTdIdx].querySelector('a[href]') as HTMLAnchorElement | null;
      const name = (anchor?.textContent || '').trim();
      const id = nameToSlug(name);
      if (id) itemIdCache.add(id);
      // Type is next td after name
      const typeTd = tds[nameTdIdx + 1] || null;
      const typeRaw = (typeTd?.textContent || '').trim();
      if (typeRaw) {
        const key = typeRaw.toLowerCase();
        if (!itemTypeCache.has(key)) itemTypeCache.set(key, typeRaw);
      }
    }
  } catch (e) {
    console.warn('Failed to preload item ids', e);
  }
}
