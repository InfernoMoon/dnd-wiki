import type { MarkdownPostProcessorContext } from 'obsidian';
import { RenderCache } from '../../cache/renderCache';
import type { CachedRender } from '../../cache/renderCache';
import { getPrimarySlug, nameToSlugs, displayNameFromSlug } from '../../utils/text';
import { fetchPageAtUrlWithSlugFallbacks } from '../../utils/wikiPageFetcher';
import { prepareNameInput, renderCollapsible } from '../../utils/renderer';

const classRenderCache = new RenderCache<CachedRender>();

async function ensureClassCached(
	className: string,
	urlKey: string,
	baseUrl: string,
): Promise<CachedRender | null> {
	const classIds = nameToSlugs(className);
	if (!classIds.length) return null;
	for (const classId of classIds) {
		const existing = classRenderCache.get(urlKey, classId);
		if (existing) return existing;
	}

	const base = baseUrl.replace(/\/$/, '');
	const fetched = await fetchPageAtUrlWithSlugFallbacks(
		className,
		slug => baseUrl.includes('2024') ? `${base}/${slug}:main` : `${base}/${slug}`,
	);
	if (!fetched.ok) return null;

	const cached: CachedRender = {
		title: fetched.titleText || displayNameFromSlug(classIds[0]),
		html: fetched.contentHtml,
	};
	for (const classId of classIds) classRenderCache.set(urlKey, classId, cached);
	return cached;
}

export async function renderClass(
	source: string,
	el: HTMLElement,
	_ctx: MarkdownPostProcessorContext | undefined,
	urlKey: string,
	baseUrl: string,
): Promise<void> {
	const lines = prepareNameInput(el, source, baseUrl, 'Provide one or more class names.');
	if (!lines) return;

	const container = el.createDiv();
	for (const className of lines) {
		const classId = getPrimarySlug(className);
		if (!classId) continue;
		const host = container.createDiv();
		const cached = await ensureClassCached(className, urlKey, baseUrl);

		if (cached?.html) {
			renderCollapsible(host, cached.title, cached.html);
		} else {
			host.textContent = `Failed to load class: ${displayNameFromSlug(classId)}`;
		}
	}
}
