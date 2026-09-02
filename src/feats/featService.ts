/**
 * featService.ts
 * Manages feat IDs and rendered feat content.
 * - Preloads known feat IDs from the configured base URL and custom vault files
 * - Caches rendered feat cards by URL key and feat ID
 */
import { TFile, TFolder, TAbstractFile } from 'obsidian';
import { getObsidianApp } from '../utils/obsidian';
import { nameToSlug } from '../utils/text';
import { loadFromLinks, loadFromTable, LoaderConfig } from '../genericLoader';

interface CachedFeat {
	title: string;
	html: string;
}

// In-memory set of known feat IDs per URL key.
const featIdCache: Map<string, Set<string>> = new Map();

// In-memory cache for rendered feat content, keyed by URL key and feat ID.
const featRenderCache: Map<string, Map<string, CachedFeat>> = new Map();

function getRenderCacheForKey(urlKey: string): Map<string, CachedFeat> {
	const existing = featRenderCache.get(urlKey);
	if (existing) return existing;
	const cache = new Map<string, CachedFeat>();
	featRenderCache.set(urlKey, cache);
	return cache;
}

/** Get a cached rendered feat by URL key and ID. */
export function getCachedFeat(urlKey: string, id: string): CachedFeat | null {
	return getRenderCacheForKey(urlKey).get(id) ?? null;
}

/** Store rendered feat content in the cache. */
export function setCachedFeat(urlKey: string, id: string, data: CachedFeat): void {
	getRenderCacheForKey(urlKey).set(id, data);
}

/** Get known feat IDs for a specific URL key. */
export function getKnownFeatIdsForKey(urlKey: string): string[] {
	return Array.from(featIdCache.get(urlKey) ?? []).sort((a, b) => a.localeCompare(b));
}

/** Preload feat IDs for a URL key and include custom feats from the vault. */
export async function preloadAllFeatIds(urlKey: string, baseUrl: string): Promise<void> {
	let cache = featIdCache.get(urlKey);
	if (!cache) {
		cache = new Set();
		featIdCache.set(urlKey, cache);
	}

	const config: LoaderConfig = {
		baseUrl,
		indexPath: '/feats',
		linkPattern: /^\/feat:([^\s"'>]+)$/i,
		tableRowSelector: 'table tr',
		tableCellSelector: 'td',
		replacePatterns: [['(ua)', ''], ['(UA)', '']],
		filterFn: (name: string) => !name.includes('Alltoc'),
	};

	const is2024 = baseUrl.includes('2024');
	const featIds = is2024
		? await loadFromTable(config)
		: await loadFromLinks(config);
	for (const id of featIds) cache.add(id);

	try {
		const app = getObsidianApp();
		const vault = app?.vault;
		const folder = vault?.getAbstractFileByPath('DnD-Cards/Feats');
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
