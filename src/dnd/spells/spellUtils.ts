/**
 * spellUtils.ts
 * Shared helpers for spell rendering and data preloading.
 * - Caches known spell IDs and rendered content
 * - Preloads names from `/spells` index
 * - Fetches spell pages and applies UA fallback
 * - Renders collapsible cards with sanitized content
 */
import { IdCache } from '../../cache/idCache';
import { RenderCache } from '../../cache/renderCache';
import type { CachedRender } from '../../cache/renderCache';
import { getPrimarySlug, nameToSlugs, displayNameFromSlug } from '../../utils/text';
import { fetchPageContent } from '../../utils/wikiPageFetcher';
import { renderCollapsible } from '../../utils/renderer';
import { loadFromTable, LoaderConfig } from "../../utils/wikiIndexLoader";
import {
	getCachedHomebrewSpellContent,
	getCachedHomebrewSpellIds,
	hasCachedHomebrewFile,
	homebrewSpells,
} from '../../homebrew/homebrewService';

export const spellIdCache = new IdCache();
const spellRenderCache = new RenderCache<CachedRender>();

/** Return known spell IDs for a specific URL key */
export function getKnownSpellIdsForKey(urlKey: string): string[] {
  return Array.from(new Set([...spellIdCache.get(urlKey), ...getCachedHomebrewSpellIds()]));
}

/**
 * Seed spell names into the cache for a URL key.
 * Called by spelllist when it fetches names directly from the index,
 * so spell suggestions and spell lists can reuse the known IDs.
 */
export function seedSpellNamesForKey(urlKey: string, names: string[]): void {
  spellIdCache.addMany(urlKey, names.map(getPrimarySlug).filter(Boolean));
}

/** Preload spell names for a specific URL key from its `/spells` index page */
export async function preloadAllSpellNames(urlKey: string, baseUrl: string): Promise<void> {
	spellIdCache.addMany(urlKey, getCachedHomebrewSpellIds());
  // Use generic table-based loader for the /spells index
  const config: LoaderConfig = {
    baseUrl,
    indexPath: '/spells',
		tableRowSelector: 'table tr',
		tableCellSelector: 'td',
		replacePatterns: [['(ua)', ''], ['(UA)', '']],
	};

	const ids = await loadFromTable(config);
	spellIdCache.addMany(urlKey, ids);
}

/** Render a single spell card with caching and UA-aware fallback */
export async function renderSingleSpell(
  host: HTMLElement,
  urlKey: string,
  baseUrl: string,
  name: string,
): Promise<boolean> {
  const spellIds = nameToSlugs(name);
  const id = spellIds[0] ?? '';
	if (!id) {
		host.createDiv({ text: 'No spell name provided' });
		return false;
	}
	const homebrew = await getCachedHomebrewSpellContent(name);
	if (homebrew) {
		spellIdCache.addMany(urlKey, spellIds);
		renderCollapsible(host, homebrew.title, homebrew.html);
		return true;
	}
	const cached = await ensureSpellCached(name, urlKey, baseUrl);
  if (!cached) {
    renderCollapsible(host, `${displayNameFromSlug(id)} (Error)`, 'Error getting this spell.');
    return false;
  }

  renderCollapsible(host, cached.title, cached.html);
  return true;
}

/** Get a cached spell, fetching it with all supported slug variants when needed. */
export async function ensureSpellCached(
  spellName: string,
  urlKey: string,
  baseUrl: string,
): Promise<CachedRender | null> {
	const spellIds = nameToSlugs(spellName);
	if (!spellIds.length) return null;
	const isHomebrew = hasCachedHomebrewFile(spellName, homebrewSpells);
	const homebrew = await getCachedHomebrewSpellContent(spellName);
	if (isHomebrew) {
		spellIdCache.addMany(urlKey, spellIds);
		return homebrew;
	}

	const cached = getCachedSpell(spellIds, urlKey);
  if (cached) return cached;

  const fetched = await fetchSpellPageWithFallback(baseUrl, spellName);
  if (!fetched.ok) return null;

  const cachedSpell: CachedRender = {
    title: fetched.titleText || displayNameFromSlug(spellIds[0]),
    html: fetched.contentHtml,
  };
  cacheSpellRender(urlKey, spellIds, cachedSpell);
  return cachedSpell;
}

function getCachedSpell(spellIds: string[], urlKey: string): CachedRender | null {
  for (const spellId of spellIds) {
    const cached = spellRenderCache.get(urlKey, spellId);
    if (cached) return cached;

    const uaCached = spellRenderCache.get(urlKey, `${spellId}-ua`);
    if (uaCached) return uaCached;
  }
  return null;
}

function cacheSpellRender(urlKey: string, spellIds: string[], cached: CachedRender): void {
  for (const spellId of spellIds) {
    spellRenderCache.set(urlKey, spellId, cached);
  }
}

// Try each compatible slug, then its UA variant.
async function fetchSpellPageWithFallback(baseUrl: string, id: string): Promise<{ ok: boolean; titleText: string; contentHtml: string }> {
  for (const spellId of nameToSlugs(id)) {
    const first = await fetchPageContent(baseUrl, 'spell', spellId);
    if (first.ok) return first;

    const uaVariant = await fetchPageContent(baseUrl, 'spell', `${spellId}-ua`);
    if (uaVariant.ok) return uaVariant;
  }
  return { ok: false, titleText: '', contentHtml: '' };
}

