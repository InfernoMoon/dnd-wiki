/**
 * subclassUtils.ts
 * Cache and preloading for subclass IDs per class.
 * Loads by fetching the class page and extracting /{classname}:{subclass} links.
 */
import { requestUrl } from 'obsidian';
import { nameToSlug, displayNameFromSlug } from '../utils';

// subclassCache[urlKey][classSlug] = string[] of subclass slugs
const subclassCache = new Map<string, Map<string, string[]>>();

function getCacheForKey(urlKey: string): Map<string, string[]> {
  if (!subclassCache.has(urlKey)) subclassCache.set(urlKey, new Map());
  return subclassCache.get(urlKey)!;
}

export function getKnownSubclassIdsForClass(urlKey: string, classSlug: string): string[] {
  return getCacheForKey(urlKey).get(classSlug) ?? [];
}

export function getKnownSubclassNamesForClass(urlKey: string, classSlug: string): string[] {
  return getKnownSubclassIdsForClass(urlKey, classSlug).map(displayNameFromSlug);
}

/**
 * Preload subclass IDs for a given class by fetching its page
 * and extracting all /{classname}:{subclass} links.
 */
export async function preloadSubclassIds(urlKey: string, baseUrl: string, classSlug: string): Promise<void> {
  const cache = getCacheForKey(urlKey);
  if (cache.has(classSlug)) return; // already loaded

  const base = baseUrl.replace(/\/$/, '');
  const pageUrl = baseUrl.includes('2024')
    ? `${base}/${classSlug}:main`
    : `${base}/${classSlug}`;

  try {
    const res = await requestUrl({ url: pageUrl, method: 'GET' });
    if (res.status < 200 || res.status >= 300) { cache.set(classSlug, []); return; }
    const parser = new DOMParser();
    const doc = parser.parseFromString(res.text, 'text/html');
    // Match hrefs that end with /{classSlug}:{subclass}, excluding spell-related pages
    const pattern = new RegExp(`\\/${classSlug}:([^\\s"'>/]+)$`, 'i');
    const ids = new Set<string>();
    for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
      const href = a.getAttribute('href') || '';
      if (/spells:|spell-list/i.test(href)) continue;
      const m = pattern.exec(href);
      if (m) {
        const id = nameToSlug(m[1]);
        if (id) ids.add(id);
      }
    }
    cache.set(classSlug, Array.from(ids).sort((a, b) => a.localeCompare(b)));
  } catch {
    cache.set(classSlug, []);
  }
}
