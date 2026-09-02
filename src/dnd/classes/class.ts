import type { MarkdownPostProcessorContext } from 'obsidian';
import { RenderCache } from '../../cache/renderCache';
import type { CachedRender } from '../../cache/renderCache';
import { nameToSlug, displayNameFromSlug } from '../../utils/text';
import { fetchPageAtUrl } from '../../utils/fetcher';
import { prepareNameInput, renderCollapsible } from '../../utils/renderer';

const classRenderCache = new RenderCache();

async function ensureClassCached(
	classId: string,
	urlKey: string,
	baseUrl: string,
): Promise<CachedRender | null> {
	const existing = classRenderCache.get(urlKey, classId);
	if (existing) return existing;

	const base = baseUrl.replace(/\/$/, '');
	const path = baseUrl.includes('2024') ? `${base}/${classId}:main` : `${base}/${classId}`;
	const fetched = await fetchPageAtUrl(path);
	if (!fetched.ok) return null;

	const cached: CachedRender = {
		title: fetched.titleText || displayNameFromSlug(classId),
		html: fetched.contentHtml,
	};
	classRenderCache.set(urlKey, classId, cached);
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
	for (const classId of lines.map(line => nameToSlug(line)).filter(Boolean)) {
		const host = container.createDiv();
		const cached = await ensureClassCached(classId, urlKey, baseUrl);

		if (cached?.html) {
			renderCollapsible(host, cached.title, cached.html);
		} else {
			host.textContent = `Failed to load class: ${displayNameFromSlug(classId)}`;
		}
	}
}
