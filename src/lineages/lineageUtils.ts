/**
 * lineageUtils.ts
 * Utilities for lineage metadata and ID management.
 */
import { App, TFile, TFolder, TAbstractFile } from 'obsidian';
import { nameToSlug } from '../utils';
import { loadFromLinks, loadFromTable, LoaderConfig } from '../genericLoader';

const lineageIdCache: Map<string, Set<string>> = new Map();

export function getKnownLineageIdsForKey(urlKey: string): string[] {
  return Array.from(lineageIdCache.get(urlKey) ?? []).sort((a, b) => a.localeCompare(b));
}

export async function preloadAllLineageIds(urlKey: string, baseUrl: string): Promise<void> {
  if (!lineageIdCache.has(urlKey)) lineageIdCache.set(urlKey, new Set());
  const cache = lineageIdCache.get(urlKey)!;

  const is2024 = baseUrl.includes('2024');

  if (is2024) {
    // 2024: fetch both /lineage and /species:all in parallel
    const tableConfig: Omit<LoaderConfig, 'indexPath'> = {
      baseUrl,
      tableRowSelector: 'table tr',
      tableCellSelector: 'td',
      replacePatterns: [['Lineage: ', ''], ['Species: ', ''], ['(ua)', ''], ['(UA)', '']],
    };
    const [ids1, ids2] = await Promise.all([
      loadFromTable({ ...tableConfig, indexPath: '/lineage' }),
      loadFromTable({ ...tableConfig, indexPath: '/species:all' }),
    ]);
    for (const id of ids1) cache.add(id);
    for (const id of ids2) cache.add(id);
  } else {
    // 5e: link-based method
    const config: LoaderConfig = {
      baseUrl,
      indexPath: '/lineage',
      linkPattern: /^\/lineage:([^\s"'>]+)$/i,
      tableRowSelector: 'table tr',
      tableCellSelector: 'td',
    };
    const ids = await loadFromLinks(config);
    for (const id of ids) cache.add(id);
  }

  // Also include any custom lineages from the vault folder DnD-Cards/Lineages
  try {
    const app = (globalThis as unknown as { app?: App }).app;
    const vault = app?.vault;
    const folderPath = 'DnD-Cards/Lineages';
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
    console.warn('Unable to include custom lineages during preload', err);
  }
}
