import type { MarkdownPostProcessorContext } from 'obsidian';
import { RenderCache } from '../../cache/renderCache';
import type { CachedRender } from '../../cache/renderCache';
import { getPrimarySlug, nameToSlugs, displayNameFromSlug } from '../../utils/text';
import { fetchPageAtUrl } from '../../utils/wikiPageFetcher';
import { renderWithSections, parseSectionDirectives } from '../../utils/sectionRenderer';
import { requireBaseUrl } from '../../utils/renderer';
import { preloadSubclassIds } from './subclassUtils';

const subclassRenderCache = new RenderCache<CachedRender>();

async function ensureSubclassCached(
	className: string,
	subinfoName: string,
	urlKey: string,
	baseUrl: string,
): Promise<CachedRender | null> {
	const classSlugs = nameToSlugs(className);
	const subinfoSlugs = nameToSlugs(subinfoName);
	if (!classSlugs.length || !subinfoSlugs.length) return null;

	for (const classSlug of classSlugs) {
		for (const subinfoSlug of subinfoSlugs) {
			const existing = subclassRenderCache.get(urlKey, `${classSlug}:${subinfoSlug}`);
			if (existing) return existing;
		}
	}

	const base = baseUrl.replace(/\/$/, '');
	for (const classSlug of classSlugs) {
		for (const subinfoSlug of subinfoSlugs) {
			const fetched = await fetchPageAtUrl(`${base}/${classSlug}:${subinfoSlug}`);
			if (!fetched.ok) continue;

			const cached: CachedRender = {
				title: fetched.titleText || `${displayNameFromSlug(classSlugs[0])}: ${displayNameFromSlug(subinfoSlugs[0])}`,
				html: fetched.contentHtml,
			};
			for (const cachedClassSlug of classSlugs) {
				for (const cachedSubinfoSlug of subinfoSlugs) {
					subclassRenderCache.set(urlKey, `${cachedClassSlug}:${cachedSubinfoSlug}`, cached);
				}
			}
			return cached;
		}
	}

	return null;
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

	const classSlug = getPrimarySlug(classMatch[1].trim());
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

	const subinfoSlugs = rawSubinfos.map(getPrimarySlug).filter(Boolean);
	if (!subinfoSlugs.length) {
		el.createDiv({ text: 'Invalid subinfo name(s).' });
		return;
	}

	const subinfoName = rawSubinfos[rawSubinfos.length - 1];
	const subinfoSlug = getPrimarySlug(subinfoName);
	const host = el.createDiv();
	const cached = await ensureSubclassCached(classMatch[1].trim(), subinfoName, urlKey, baseUrl);

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
