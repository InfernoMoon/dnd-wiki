/**
 * featUtils.ts
 * Utilities for feat metadata and ID management.
 * - Preloads known feat IDs from the configured base URL and custom vault files
 * - Provides helpers to access and format feat identifiers
 */
import { requestUrl, App, TFile, TFolder, TAbstractFile } from 'obsidian';
import { nameToSlug } from './utils';

// In-memory set of all known feat ids (normalized slugs)
const featIdCache: Set<string> = new Set();

/**
 * Get all known feat IDs as sorted slugs.
 * @returns Array of normalized feat slugs (sorted ascending).
 */
export function getKnownFeatIds(): string[] {
  return Array.from(featIdCache).sort((a, b) => a.localeCompare(b));
}

/**
 * Preload feat IDs from the base URL and include custom feats from the vault.
 * Parses the root page to collect links matching "/feat:<id>" and adds any
 * files found under the "DnD-Cards/Feats" folder.
 * @param baseUrl The configured base URL to fetch and parse.
 */
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
