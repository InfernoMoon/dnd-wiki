/** Render filtered `spellList` code blocks. */
import type { MarkdownPostProcessorContext } from 'obsidian';
import { requestUrl } from 'obsidian';
import { FilteredListCache } from '../../cache/filteredListCache';
import { extractTableNamesFromFirstCell } from '../../utils/dom';
import { getTextProperties } from '../../utils/directives';
import { requireBaseUrl } from '../../utils/renderer';
import {
	matchesSearch,
	parseSearchDirective,
	parseSearchModeDirective,
} from '../../utils/search';
import type { SearchMode } from '../../utils/search';
import { displayNameFromSlug, getPrimarySlug } from '../../utils/text';
import {
	renderSingleSpell,
	seedSpellNamesForKey,
} from './spellUtils';
import { SpellListCacheItem } from './spellListCacheItem';
import type {
	SpellLevelDirective,
	SpellFilterDirective,
} from './spellListCacheItem';

interface SpellListDirectives {
	level: SpellLevelDirective;
	classDirective: SpellFilterDirective;
	schoolDirective: SpellFilterDirective;
	addSpells: string[];
	removeSpells: string[];
	searches: string[];
	searchMode: SearchMode;
}

interface SpellIndexDocuments {
	base: Document;
	classes: Document[];
	schools: Document[];
}

interface FilteredSpellNames {
	names: string[];
	message?: string;
}

const spellListCache = new FilteredListCache<SpellListCacheItem, string[]>();

export async function renderSpellList(
	source: string,
	el: HTMLElement,
	_ctx: MarkdownPostProcessorContext | undefined,
	urlKey: string,
	baseUrl: string,
): Promise<void> {
	el.empty();
	if (!requireBaseUrl(el, baseUrl)) return;

	const directives = parseSpellListDirectives(source);
	const cacheItem = new SpellListCacheItem(
		directives.level,
		directives.classDirective,
		directives.schoolDirective,
	);

	let names = spellListCache.get(urlKey, cacheItem);
	if (names === null) {
		const index = await loadSpellIndexWithRetry(
			el,
			baseUrl,
			directives.classDirective,
			directives.schoolDirective,
		);
		if (!index) return;

		const filtered = getFilteredSpellNames(index, directives);
		if (filtered.message) {
			el.setText(filtered.message);
			return;
		}

		names = filtered.names;
		spellListCache.set(urlKey, cacheItem, names);
	}

	names = applyExplicitSpellChanges(names, directives.addSpells, directives.removeSpells);
	if (!names.length) {
		el.setText('No spell names found.');
		return;
	}

	seedSpellNamesForKey(urlKey, names);
	const wrapper = el.createDiv();
	wrapper.createEl('h2', {
		cls: 'dnd-wiki-list-heading',
		text: buildHeading(directives),
	});
	await renderSpellCards(
		names,
		wrapper.createDiv(),
		urlKey,
		baseUrl,
		directives.searches,
		directives.searchMode,
	);
}

function parseSpellListDirectives(source: string): SpellListDirectives {
	const properties = getTextProperties(source, [
		'level',
		'class',
		'school',
		'addspells',
		'removespells',
	]);

	return {
		level: parseLevelDirective(properties.get('level') ?? []),
		classDirective: parseSlugDirective(properties.get('class') ?? []),
		schoolDirective: parseSlugDirective(properties.get('school') ?? []),
		addSpells: parseSpellNames(properties.get('addspells') ?? []),
		removeSpells: parseSpellNames(properties.get('removespells') ?? []),
		searches: parseSearchDirective(source),
		searchMode: parseSearchModeDirective(source),
	};
}

function parseLevelDirective(values: string[]): SpellLevelDirective {
	const raw = values.join(',').trim();
	if (!raw) return null;
	if (/^all$/i.test(raw)) return 'all';

	const levels: number[] = [];
	for (const token of raw.split(',')) {
		levels.push(...parseLevelToken(token));
	}

	const uniqueLevels = Array.from(new Set(levels)).sort((a, b) => a - b);
	if (!uniqueLevels.length) return null;
	return uniqueLevels.length === 1 ? uniqueLevels[0] : uniqueLevels;
}

function parseLevelToken(token: string): number[] {
	const value = token.trim();
	if (/^\d+$/.test(value)) {
		const level = Number.parseInt(value, 10);
		return level >= 0 && level <= 9 ? [level] : [];
	}

	const range = /^(\d+)\s*-\s*(\d+)$/.exec(value);
	if (!range) return [];

	const start = Number.parseInt(range[1], 10);
	const end = Number.parseInt(range[2], 10);
	return expandLevelRange(start, end);
}

function expandLevelRange(start: number, end: number): number[] {
	const first = Math.max(0, Math.min(start, end));
	const last = Math.min(9, Math.max(start, end));
	if (first > last) return [];

	const levels: number[] = [];
	for (let level = first; level <= last; level++) levels.push(level);
	return levels;
}

function parseSlugDirective(values: string[]): SpellFilterDirective {
	const raw = values.join(',').trim();
	if (!raw) return null;
	if (/^all$/i.test(raw)) return 'all';

	const slugs = raw
		.split(',')
		.map(value => getPrimarySlug(value.trim()))
		.filter(Boolean);
	return slugs.length ? Array.from(new Set(slugs)) : null;
}

function parseSpellNames(values: string[]): string[] {
	const slugs: string[] = [];
	for (const value of values.join(',').split(',')) {
		const slug = getPrimarySlug(value.trim());
		if (slug) slugs.push(slug);
	}
	return Array.from(new Set(slugs));
}

async function loadSpellIndexWithRetry(
	el: HTMLElement,
	baseUrl: string,
	classDirective: SpellFilterDirective,
	schoolDirective: SpellFilterDirective,
): Promise<SpellIndexDocuments | null> {
	let status: HTMLElement | null = null;
	for (let attempt = 0; attempt <= 30; attempt++) {
		const index = await fetchSpellIndex(
			baseUrl,
			Array.isArray(classDirective) ? classDirective : [],
			Array.isArray(schoolDirective) ? schoolDirective : [],
		);
		if (index) {
			status?.remove();
			return index;
		}

		if (!status) {
			status = el.createDiv({ text: 'Failed to load spells index. Retrying…' });
		}
		if (attempt === 30) {
			status.setText('Failed to load spells index after 30 seconds.');
			return null;
		}
		status.setText(`Failed to load spells index. Retrying (${attempt + 1}s)…`);
		await new Promise<void>(resolve => window.setTimeout(resolve, 1000));
	}
	return null;
}

async function fetchSpellIndex(
	baseUrl: string,
	classSlugs: string[],
	schoolSlugs: string[],
): Promise<SpellIndexDocuments | null> {
	const base = baseUrl.replace(/\/$/, '');
	try {
		const response = await requestUrl({ url: `${base}/spells`, method: 'GET' });
		if (response.status < 200 || response.status >= 300) return null;

		const parser = new DOMParser();
		const baseDocument = parser.parseFromString(response.text, 'text/html');
		const classes = await fetchFilterDocuments(base, parser, classSlugs);
		const schools = await fetchFilterDocuments(base, parser, schoolSlugs);
		return { base: baseDocument, classes, schools };
	} catch {
		return null;
	}
}

async function fetchFilterDocuments(
	baseUrl: string,
	parser: DOMParser,
	slugs: string[],
): Promise<Document[]> {
	const documents: Document[] = [];
	for (const slug of slugs) {
		try {
			const response = await requestUrl({ url: `${baseUrl}/spells:${slug}`, method: 'GET' });
			if (response.status >= 200 && response.status < 300) {
				documents.push(parser.parseFromString(response.text, 'text/html'));
			}
		} catch {
			// A missing class or school page simply contributes no matches.
		}
	}
	return documents;
}

function getFilteredSpellNames(
	index: SpellIndexDocuments,
	directives: SpellListDirectives,
): FilteredSpellNames {
	let names = extractTableNamesFromFirstCell(index.base);
	const classNames = unionDocumentNames(index.classes);
	const schoolNames = unionDocumentNames(index.schools);
	if (classNames) names = names.filter(name => classNames.has(getPrimarySlug(name)));
	if (schoolNames) names = names.filter(name => schoolNames.has(getPrimarySlug(name)));

	const levelResult = filterByLevel(index.base, names, directives.level);
	if (levelResult.message) return levelResult;
	return { names: uniqueNames(levelResult.names) };
}

function unionDocumentNames(documents: Document[]): Set<string> | null {
	if (!documents.length) return null;
	const names = new Set<string>();
	for (const document of documents) {
		for (const name of extractTableNamesFromFirstCell(document)) {
			names.add(getPrimarySlug(name));
		}
	}
	return names;
}

function filterByLevel(
	document: Document,
	names: string[],
	level: SpellLevelDirective,
): FilteredSpellNames {
	const levels = typeof level === 'number' ? [level] : Array.isArray(level) ? level : [];
	if (!levels.length) return { names };

	const allowedNames = new Set<string>();
	for (const spellLevel of levels) {
		const tab = document.querySelector(`#wiki-tab-0-${spellLevel}`);
		if (!tab) continue;
		for (const name of extractTableNamesFromFirstCell(tab)) {
			allowedNames.add(getPrimarySlug(name));
		}
	}

	if (!allowedNames.size) {
		return { names: [], message: `No spells found for levels ${levels.join(', ')}` };
	}
	return { names: names.filter(name => allowedNames.has(getPrimarySlug(name))) };
}

function uniqueNames(names: string[]): string[] {
	return Array.from(new Map(names.map(name => [getPrimarySlug(name), name])).values());
}

function applyExplicitSpellChanges(
	names: string[],
	addSpells: string[],
	removeSpells: string[],
): string[] {
	const result = names.slice();
	const existing = new Set(result.map(getPrimarySlug));
	for (const slug of addSpells) {
		if (!existing.has(slug)) {
			result.push(displayNameFromSlug(slug));
			existing.add(slug);
		}
	}

	const removed = new Set(removeSpells);
	return result.filter(name => !removed.has(getPrimarySlug(name)));
}

function buildHeading(directives: SpellListDirectives): string {
	const parts: string[] = [];
	if (Array.isArray(directives.level)) parts.push(`Level ${directives.level.join(', ')}`);
	else if (typeof directives.level === 'number') parts.push(`Level ${directives.level}`);
	if (Array.isArray(directives.classDirective) && directives.classDirective.length) {
		parts.push(`Class ${directives.classDirective.map(displayNameFromSlug).join(', ')}`);
	}
	if (Array.isArray(directives.schoolDirective) && directives.schoolDirective.length) {
		parts.push(`School ${directives.schoolDirective.map(displayNameFromSlug).join(', ')}`);
	}
	return parts.length ? `Spells ${parts.join(' · ')}` : 'All spells';
}

async function renderSpellCards(
	names: string[],
	container: HTMLElement,
	urlKey: string,
	baseUrl: string,
	searches: string[],
	searchMode: SearchMode,
): Promise<void> {
	await Promise.all(names.map(async name => {
		const host = container.createDiv('dnd-wiki-card-spacer');
		const rendered = await renderSingleSpell(host, urlKey, baseUrl, name);
		if (!rendered && searches.length) {
			host.classList.add('dnd-wiki-search-hidden');
			return;
		}

		if (searches.length) {
			const cachedContent = {
				title: host.querySelector('.dnd-wiki-card-title-text')?.textContent ?? '',
				html: host.querySelector('.dnd-wiki-card-content')?.innerHTML ?? '',
			};
			if (!matchesSearch(cachedContent, searches, searchMode)) {
				host.classList.add('dnd-wiki-search-hidden');
			}
		}
	}));
}
