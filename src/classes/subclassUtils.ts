/**
 * subclassUtils.ts
 * Cache and preloading for subclass IDs per class.
 * Loads by fetching class/subinfo pages and extracting /{classname}:{subinfo} links.
 */
import { requestUrl } from 'obsidian';
import { nameToSlug, displayNameFromSlug } from '../utils/text';

// subclassCache[urlKey]["classSlug|parentSubinfoSlug"] = string[] of subinfo slugs
const subclassCache = new Map<string, Map<string, string[]>>();
const ROOT_PARENT = '__root__';

function getCacheForKey(urlKey: string): Map<string, string[]> {
  const existing = subclassCache.get(urlKey);
  if (existing) return existing;
  const cache = new Map<string, string[]>();
  subclassCache.set(urlKey, cache);
  return cache;
}

export function getKnownSubclassIdsForClass(urlKey: string, classSlug: string): string[] {
  return getKnownSubclassIdsForParent(urlKey, classSlug);
}

export function getKnownSubclassNamesForClass(urlKey: string, classSlug: string): string[] {
  return getKnownSubclassNamesForParent(urlKey, classSlug);
}

function makeCacheKey(classSlug: string, parentSubinfoSlug?: string): string {
  return `${classSlug}|${parentSubinfoSlug || ROOT_PARENT}`;
}

export function getKnownSubclassIdsForParent(urlKey: string, classSlug: string, parentSubinfoSlug?: string): string[] {
  return getCacheForKey(urlKey).get(makeCacheKey(classSlug, parentSubinfoSlug)) ?? [];
}

export function getKnownSubclassNamesForParent(urlKey: string, classSlug: string, parentSubinfoSlug?: string): string[] {
  return getKnownSubclassIdsForParent(urlKey, classSlug, parentSubinfoSlug).map(displayNameFromSlug);
}

/**
 * Preload subinfo IDs for a given class and optional parent subinfo.
 * When parentSubinfoSlug is empty, fetches the class page.
 * Otherwise fetches /{classSlug}:{parentSubinfoSlug} and extracts next links.
 */
export async function preloadSubclassIds(urlKey: string, baseUrl: string, classSlug: string, parentSubinfoSlug?: string): Promise<void> {
  const cache = getCacheForKey(urlKey);
  const key = makeCacheKey(classSlug, parentSubinfoSlug);
  if (cache.has(key)) return; // already loaded

  const base = baseUrl.replace(/\/$/, '');
  const pageUrl = parentSubinfoSlug
    ? `${base}/${classSlug}:${parentSubinfoSlug}`
    : (baseUrl.includes('2024') ? `${base}/${classSlug}:main` : `${base}/${classSlug}`);

  try {
    const res = await requestUrl({ url: pageUrl, method: 'GET' });
    if (res.status < 200 || res.status >= 300) { cache.set(key, []); return; }
    const parser = new DOMParser();
    const doc = parser.parseFromString(res.text, 'text/html');
    // Match hrefs that end with /{classSlug}:{subinfo}, excluding spell-related pages
    const pattern = new RegExp(`\\/${classSlug}:([^\\s"'>/]+)$`, 'i');
    const ids = new Set<string>();
    for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
      const href = a.getAttribute('href') || '';
      if (/spells:|spell-list/i.test(href)) continue;
      const m = pattern.exec(href);
      if (m) {
        const id = nameToSlug(m[1]);
        if (!id) continue;
        if (id === 'main') continue;
        if (/toc\d+$/i.test(id)) continue;
        ids.add(id);
      }
    }
    cache.set(key, Array.from(ids).sort((a, b) => a.localeCompare(b)));
  } catch {
    cache.set(key, []);
  }
}
