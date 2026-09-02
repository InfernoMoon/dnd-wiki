import { TFolder, TFile, TAbstractFile } from 'obsidian';
import { getObsidianApp } from '../../utils/obsidian';
import { nameToSlug } from '../../utils/text';
import { loadFromTable, LoaderConfig } from '../../genericLoader';

// In-memory set of known item ids per URL key (normalized slugs)
const itemIdCache: Map<string, Set<string>> = new Map();
// In-memory map of item types (case-insensitive key -> original display value)
const itemTypeCache: Map<string, string> = new Map();
const STANDARD_ITEM_TYPES = [
  'Armor',
  'Potion',
  'Ring',
  'Rod',
  'Scroll',
  'Staff',
  'Wand',
  'Weapon',
  'Wondrous Item',
];

function getItemCacheForKey(urlKey: string): Set<string> {
  const existing = itemIdCache.get(urlKey);
  if (existing) return existing;
  const cache = new Set<string>();
  itemIdCache.set(urlKey, cache);
  return cache;
}

export function getKnownItemIdsForKey(urlKey: string): string[] {
  return Array.from(itemIdCache.get(urlKey) ?? []).sort((a, b) => a.localeCompare(b));
}

export function getCachedItemTypes(): string[] {
  return Array.from(itemTypeCache.values()).sort((a, b) => a.localeCompare(b));
}

/** Return standard and discovered item types in one shared suggestion list. */
export function getItemTypeSuggestions(): string[] {
  return Array.from(new Set([...STANDARD_ITEM_TYPES, ...getCachedItemTypes()]));
}

export async function preloadAllItemIds(urlKey: string, baseUrl: string): Promise<void> {
  const cache = getItemCacheForKey(urlKey);

  // rowProcessor extracts item type from the td after the name td
  const rowProcessor = (row: Element, _name: string) => {
    const tds = Array.from(row.querySelectorAll('td'));
    const nameTdIdx = tds.findIndex((td) => !!td.querySelector('a[href]'));
    if (nameTdIdx === -1) return;
    const typeTd = tds[nameTdIdx + 1];
    const typeRaw = (typeTd?.textContent || '').trim();
    if (typeRaw) {
      const key = typeRaw.toLowerCase();
      if (!itemTypeCache.has(key)) itemTypeCache.set(key, typeRaw);
    }
  };

  // Config shared by both index pages — name extracted from anchor text
  const baseConfig: Omit<LoaderConfig, 'indexPath'> = {
    baseUrl,
    tableRowSelector: 'table tr',
    tableCellSelector: 'td a[href]',
    useLinkMethod: false,
    useTableMethod: true,
    rowProcessor,
  };

  // Fetch both item index pages in parallel
  const [ids1, ids2] = await Promise.all([
    loadFromTable({ ...baseConfig, indexPath: '/wondrous-items' }),
    loadFromTable({ ...baseConfig, indexPath: '/magic-item:all' }),
  ]);
  for (const id of ids1) cache.add(id);
  for (const id of ids2) cache.add(id);

  // Also include any custom items from the vault folder DnD-Cards/Items
  try {
    const app = getObsidianApp();
    const vault = app?.vault;
    const folderPath = 'DnD-Cards/Items';
    const folder = vault?.getAbstractFileByPath(folderPath);
    if (folder instanceof TFolder) {
      const children: TAbstractFile[] = folder.children;
      for (const child of children) {
        if (child instanceof TFile && child.extension?.toLowerCase() === 'md') {
          const baseName: string = child.basename || child.name.replace(/\.md$/i, '');
          const idSlug = nameToSlug(baseName);
          if (idSlug) cache.add(idSlug);
          if (vault) {
            try {
              const raw = await vault.read(child);
              const typeMatch = /^(?:type)\s*:\s*(.+)$/im.exec(raw);
              const typeRawLocal = (typeMatch?.[1] || '').trim();
              if (typeRawLocal) {
                const key = typeRawLocal.toLowerCase();
                if (!itemTypeCache.has(key)) itemTypeCache.set(key, typeRawLocal);
              }
            } catch {
              // ignore per-file errors
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Unable to include custom items during preload', err);
  }
}
