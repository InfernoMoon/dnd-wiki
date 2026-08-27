/**
 * featUtils.ts
 * Utilities for feat metadata and ID management.
 * - Preloads known feat IDs from the configured base URL and custom vault files
 * - Provides helpers to access and format feat identifiers
 */
import { TFile, TFolder, TAbstractFile } from 'obsidian';
import { getObsidianApp, nameToSlug } from '../utils';
import { loadFromLinks, loadFromTable, LoaderConfig } from '../genericLoader';

// In-memory set of known feat ids per URL key (normalized slugs)
const featIdCache: Map<string, Set<string>> = new Map();

/**
 * Get known feat IDs for a specific URL key.
 * @param urlKey The URL key (e.g. "5e", "2024").
 * @returns Array of normalized feat slugs for that key (sorted ascending).
 */
export function getKnownFeatIdsForKey(urlKey: string): string[] {
  return Array.from(featIdCache.get(urlKey) ?? []).sort((a, b) => a.localeCompare(b));
}

/**
 * Preload feat IDs for a specific URL key and include custom feats from the vault.
 * @param urlKey The URL key to store results under (e.g. "5e", "2024").
 * @param baseUrl The configured base URL to fetch and parse.
 */
export async function preloadAllFeatIds(urlKey: string, baseUrl: string): Promise<void> {
  if (!featIdCache.has(urlKey)) featIdCache.set(urlKey, new Set());
  const cache = featIdCache.get(urlKey)!;

  // Configure generic loader for feats
  const config: LoaderConfig = {
    baseUrl,
    indexPath: '/feats',
    linkPattern: /^\/feat:([^\s"'>]+)$/i,
    tableRowSelector: 'table tr',
    tableCellSelector: 'td',
    replacePatterns: [['(ua)', ''], ['(UA)', '']],
    filterFn: (name: string) => !name.includes('Alltoc'),
  };

  // Use 2024+ table method if URL contains "2024", otherwise use link-based method
  const is2024 = baseUrl.includes('2024');
  const featIds = is2024
    ? await loadFromTable(config)
    : await loadFromLinks(config);
  for (const id of featIds) {
    cache.add(id);
  }

  // Also include any custom feats from the vault folder DnD-Cards/Feats
  try {
    const app = getObsidianApp();
    const vault = app?.vault;
    const folderPath = 'DnD-Cards/Feats';
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
    console.warn('Unable to include custom feats during preload', err);
  }
}
