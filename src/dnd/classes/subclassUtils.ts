import { requestUrl } from 'obsidian';
import { GroupedIdCache } from '../../cache/idCache';
import { getPrimarySlug, displayNameFromSlug } from '../../utils/text';

const subclassIdCache = new GroupedIdCache();
const ROOT_PARENT = '__root__';

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
  return subclassIdCache.get(urlKey, makeCacheKey(classSlug, parentSubinfoSlug));
}

export function getKnownSubclassNamesForParent(urlKey: string, classSlug: string, parentSubinfoSlug?: string): string[] {
  return getKnownSubclassIdsForParent(urlKey, classSlug, parentSubinfoSlug).map(displayNameFromSlug);
}

export async function preloadSubclassIds(urlKey: string, baseUrl: string, classSlug: string, parentSubinfoSlug?: string): Promise<void> {
  const key = makeCacheKey(classSlug, parentSubinfoSlug);
  if (subclassIdCache.has(urlKey, key)) return; // already loaded

  const base = baseUrl.replace(/\/$/, '');
  const pageUrl = parentSubinfoSlug
    ? `${base}/${classSlug}:${parentSubinfoSlug}`
    : (baseUrl.includes('2024') ? `${base}/${classSlug}:main` : `${base}/${classSlug}`);

  try {
    const res = await requestUrl({ url: pageUrl, method: 'GET' });
    if (res.status < 200 || res.status >= 300) { subclassIdCache.set(urlKey, key, []); return; }
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
        const id = getPrimarySlug(m[1]);
        if (!id) continue;
        if (id === 'main') continue;
        if (/toc\d+$/i.test(id)) continue;
        ids.add(id);
      }
    }
    subclassIdCache.set(urlKey, key, Array.from(ids).sort((a, b) => a.localeCompare(b)));
  } catch {
    subclassIdCache.set(urlKey, key, []);
  }
}
