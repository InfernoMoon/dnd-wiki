import type { MarkdownPostProcessorContext } from 'obsidian';
import { RenderCache } from '../../cache/renderCache';
import type { CachedRender } from '../../cache/renderCache';
import { nameToSlug, displayNameFromSlug } from '../../utils/text';
import { fetchPageAtUrl } from '../../utils/fetcher';
import { renderWithSections, parseSectionDirectives } from '../../sectionRenderer';
import { requireBaseUrl } from '../../utils/renderer';
import { preloadSubclassIds } from './subclassUtils';

const subclassRenderCache = new RenderCache<CachedRender>();

async function ensureSubclassCached(
	classSlug: string,
	subinfoSlug: string,
	urlKey: string,
	baseUrl: string,
): Promise<CachedRender | null> {
	const cacheKey = `${classSlug}:${subinfoSlug}`;
	const existing = subclassRenderCache.get(urlKey, cacheKey);
	if (existing) return existing;

	const base = baseUrl.replace(/\/$/, '');
	const fetched = await fetchPageAtUrl(`${base}/${cacheKey}`);
	if (!fetched.ok) return null;

	const cached: CachedRender = {
		title: fetched.titleText || `${displayNameFromSlug(classSlug)}: ${displayNameFromSlug(subinfoSlug)}`,
		html: fetched.contentHtml,
	};
	subclassRenderCache.set(urlKey, cacheKey, cached);
	return cached;
}

export async function renderSubclass(
	source: string,
	el: HTMLElement,
	_ctx: MarkdownPostProcessorContext | undefined,
	urlKey: string,
	baseUrl: string,
): Promise<void> {
	el.empty();
	if (!requireBaseUrl(el, baseUrl)) return;

	const classMatch = /^class:\s*(.+)$/im.exec(source);
	const subinfoMatches: RegExpExecArray[] = [];
	const subinfoPattern = /^subinfo:\s*(.+)$/gim;
	let subinfoMatch: RegExpExecArray | null;
	while ((subinfoMatch = subinfoPattern.exec(source)) !== null) {
		subinfoMatches.push(subinfoMatch);
	}

	if (!classMatch) {
		el.createDiv({ text: 'Provide a `class:` directive.' });
		return;
	}
	if (!subinfoMatches.length) {
		el.createDiv({ text: 'Provide one or more `subinfo:` directives.' });
		return;
	}

	const classSlug = nameToSlug(classMatch[1].trim());
	const classDirectiveOffset = classMatch.index ?? Number.MAX_SAFE_INTEGER;
	const rawSubinfos = subinfoMatches
		.filter(match => (match.index ?? Number.MAX_SAFE_INTEGER) > classDirectiveOffset)
		.map(match => match[1].trim())
		.filter(Boolean);
	const sectionDirectives = parseSectionDirectives(source, classDirectiveOffset);

	if (!classSlug) {
		el.createDiv({ text: 'Invalid class name.' });
		return;
	}
	if (!rawSubinfos.length) {
		el.createDiv({ text: 'Place `subinfo:` lines after `class:`.' });
		return;
	}

	const subinfoSlugs = rawSubinfos.map(nameToSlug).filter(Boolean);
	if (!subinfoSlugs.length) {
		el.createDiv({ text: 'Invalid subinfo name(s).' });
		return;
	}

	const subinfoSlug = subinfoSlugs[subinfoSlugs.length - 1];
	const host = el.createDiv();
	const cached = await ensureSubclassCached(classSlug, subinfoSlug, urlKey, baseUrl);

	if (!cached) {
		host.textContent = `Failed to load subclass: ${displayNameFromSlug(classSlug)} / ${displayNameFromSlug(subinfoSlug)}`;
		return;
	}

	renderWithSections(
		host,
		cached.title,
		cached.html,
		sectionDirectives,
		`No matching sections found in ${displayNameFromSlug(classSlug)} / ${displayNameFromSlug(subinfoSlug)}`,
	);
	await preloadSubclassIds(urlKey, baseUrl, classSlug, subinfoSlug);
}
