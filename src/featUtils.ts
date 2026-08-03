/**
 * featUtils.ts
 * Utilities for feat metadata and ID management.
 * - Preloads known feat IDs from the configured base URL and custom vault files
 * - Provides helpers to access and format feat identifiers
 */
import { App, TFile, TFolder, TAbstractFile } from 'obsidian';
import { nameToSlug } from './utils';
import { loadData, LoaderConfig } from './genericLoader';

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
 * Uses generic loader supporting both legacy and 2024+ methods.
 * Adds any files found under the "DnD-Cards/Feats" folder.
 * @param baseUrl The configured base URL to fetch and parse.
 */
export async function preloadAllFeatIds(baseUrl: string): Promise<void> {
  // Configure generic loader for feats
  const config: LoaderConfig = {
    baseUrl,
    indexPath: '/feats',
    linkPattern: /^\/feat:([^\s"'>]+)$/i,
    tableRowSelector: 'table tr',
    tableCellSelector: 'td',
    replacePatterns: [['(ua)', ''], ['(UA)', '']],
    filterFn: (name: string) => !name.includes('Alltoc'), // Exclude "Alltoc" entries
    useLinkMethod: true,
    useTableMethod: true,
  };
  
  // Load feat data using generic loader
  const featIds = await loadData(config);
  for (const id of featIds) {
    featIdCache.add(id);
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
}
