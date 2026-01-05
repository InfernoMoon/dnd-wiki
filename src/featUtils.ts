import { requestUrl, App, TFile, TFolder, TAbstractFile } from 'obsidian';
import { nameToSlug, displayNameFromSlug } from './utils';

// In-memory set of all known feat ids (normalized slugs)
const featIdCache: Set<string> = new Set();

export function getKnownFeatIds(): string[] {
  return Array.from(featIdCache).sort((a, b) => a.localeCompare(b));
}

export async function preloadAllFeatIds(baseUrl: string): Promise<void> {
  const base = baseUrl.replace(/\/$/, '');
  try {
    const res = await requestUrl({ url: `${base}/`, method: 'GET' });
    if (res.status < 200 || res.status >= 300) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(res.text, 'text/html');
    const anchors = Array.from(doc.querySelectorAll('a[href]'));
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      const m = /^\/feat:([^\s"'>]+)$/i.exec(href);
      if (m) {
        const id = nameToSlug(m[1]);
        if (id) featIdCache.add(id);
      }
    }
    // Also include any custom feats from the vault folder DnD-Cards/Feats
    try {
      const app = (globalThis as unknown as { app?: App }).app;
      const vault = app?.vault;
      const folderPath = 'DnD-Cards/Feats';
      const folder = vault?.getAbstractFileByPath(folderPath);
      if (folder instanceof TFolder) {
        const children: TAbstractFile[] = folder.children;
        for (const child of children) {
          if (child instanceof TFile && child.extension?.toLowerCase() === 'md') {
            const baseName: string = child.basename || child.name.replace(/\.md$/i, '');
            const idSlug = nameToSlug(baseName);
            if (idSlug) featIdCache.add(idSlug);
          }
        }
      }
    } catch (err) {
      console.warn('Unable to include custom feats during preload', err);
    }
  } catch (e) {
    console.warn('Failed to preload feat ids', e);
  }
}

export function toFeatDisplayName(slug: string): string {
  return displayNameFromSlug(slug);
}
