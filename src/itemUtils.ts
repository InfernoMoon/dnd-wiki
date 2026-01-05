import { requestUrl, App, TFolder, TFile, TAbstractFile } from 'obsidian';
import { nameToSlug } from './utils';

// In-memory set of all known wondrous item ids (normalized slugs)
const itemIdCache: Set<string> = new Set();
// In-memory map of item types (case-insensitive key -> original display value)
const itemTypeCache: Map<string, string> = new Map();

export function getKnownItemIds(): string[] {
  return Array.from(itemIdCache).sort((a, b) => a.localeCompare(b));
}

export function getCachedItemTypes(): string[] {
  return Array.from(itemTypeCache.values()).sort((a, b) => a.localeCompare(b));
}

export async function preloadAllItemIds(baseUrl: string): Promise<void> {
  const base = baseUrl.replace(/\/$/, '');
  try {
    const res = await requestUrl({ url: `${base}/wondrous-items`, method: 'GET' });
    if (res.status < 200 || res.status >= 300) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(res.text, 'text/html');
    const rows = Array.from(doc.querySelectorAll('table tr'));
    for (const tr of rows) {
      const tds = Array.from(tr.querySelectorAll('td'));
      const nameTdIdx = tds.findIndex((td) => !!td.querySelector('a[href]'));
      if (nameTdIdx === -1) continue;
      const anchor = tds[nameTdIdx].querySelector('a[href]') as HTMLAnchorElement | null;
      const name = (anchor?.textContent || '').trim();
      const id = nameToSlug(name);
      if (id) itemIdCache.add(id);
      // Type is next td after name
      const typeTd = tds[nameTdIdx + 1] || null;
      const typeRaw = (typeTd?.textContent || '').trim();
      if (typeRaw) {
        const key = typeRaw.toLowerCase();
        if (!itemTypeCache.has(key)) itemTypeCache.set(key, typeRaw);
      }
    }
    // Also include any custom items from the vault folder DnD-Cards/Items
    try {
      const app = (globalThis as unknown as { app?: App }).app;
      const vault = app?.vault;
      const folderPath = 'DnD-Cards/Items';
      const folder = vault?.getAbstractFileByPath(folderPath);
      if (folder instanceof TFolder) {
        const children: TAbstractFile[] = folder.children;
        for (const child of children) {
          if (child instanceof TFile && child.extension?.toLowerCase() === 'md') {
            const baseName: string = child.basename || child.name.replace(/\.md$/i, '');
            const idSlug = nameToSlug(baseName);
            if (idSlug) itemIdCache.add(idSlug);
            // Attempt to parse type from file content
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
  } catch (e) {
    console.warn('Failed to preload item ids', e);
  }
}
