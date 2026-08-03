/**
 * backgroundUtils.ts
 * Utilities for background metadata and ID management.
 * - Preloads known background IDs from the configured base URL and custom vault files
 * - Provides helpers to access and format background identifiers
 */
import { App, TFile, TFolder, TAbstractFile } from 'obsidian';
import { nameToSlug } from '../utils';
import { loadFromLinks, loadFromTable, LoaderConfig } from '../genericLoader';

// In-memory set of known background ids per URL key (normalized slugs)
const backgroundIdCache: Map<string, Set<string>> = new Map();

/**
 * Get known background IDs for a specific URL key.
 * @param urlKey The URL key (e.g. "5e", "2024").
 * @returns Array of normalized background slugs for that key (sorted ascending).
 */
export function getKnownBackgroundIdsForKey(urlKey: string): string[] {
  return Array.from(backgroundIdCache.get(urlKey) ?? []).sort((a, b) => a.localeCompare(b));
}

/**
 * Preload background IDs for a specific URL key and include custom backgrounds from the vault.
 * @param urlKey The URL key to store results under (e.g. "5e", "2024").
 * @param baseUrl The configured base URL to fetch and parse.
 */
export async function preloadAllBackgroundIds(urlKey: string, baseUrl: string): Promise<void> {
  if (!backgroundIdCache.has(urlKey)) backgroundIdCache.set(urlKey, new Set());
  const cache = backgroundIdCache.get(urlKey)!;

  // Configure generic loader for backgrounds
  const config: LoaderConfig = {
    baseUrl,
    indexPath: '/backgrounds',
    linkPattern: /^\/background:([^\s"'>]+)$/i,
    tableRowSelector: 'table tr',
    tableCellSelector: 'td',
    replacePatterns: [['Background: ', ''], ['(ua)', ''], ['(UA)', '']],
  };

  // Use 2024+ table method if URL contains "2024", otherwise use link-based method
  const is2024 = baseUrl.includes('2024');
  const backgroundIds = is2024
    ? await loadFromTable(config)
    : await loadFromLinks(config);
  for (const id of backgroundIds) {
    cache.add(id);
  }

  // Also include any custom backgrounds from the vault folder DnD-Cards/Backgrounds
  try {
    const app = (globalThis as unknown as { app?: App }).app;
    const vault = app?.vault;
    const folderPath = 'DnD-Cards/Backgrounds';
    const folder = vault?.getAbstractFileByPath(folderPath);
    if (folder instanceof TFolder) {
      const children: TAbstractFile[] = folder.children;
      for (const child of children) {
        if (child instanceof TFile && child.extension?.toLowerCase() === 'md') {
          const baseName: string = child.basename || child.name.replace(/\.md$/i, '');
          const idSlug = nameToSlug(baseName);
          if (idSlug) cache.add(idSlug);
        }
      }
    }
  } catch (err) {
    console.warn('Unable to include custom backgrounds during preload', err);
  }
}
