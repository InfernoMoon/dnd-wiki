import { requestUrl } from 'obsidian';
import { nameToSlugs } from './text';

export interface FetchedPage {
	ok: boolean;
	titleText: string;
	contentHtml: string;
}

/** Fetch a page by kind and ID, such as `/feat:alert`. */
export async function fetchPageContent(baseUrl: string, kind: string, id: string): Promise<FetchedPage> {
	return fetchPageAtUrl(`${baseUrl.replace(/\/$/, '')}/${kind}:${id}`);
}

/** Fetch a page by trying each compatible slug form until one succeeds. */
export async function fetchPageContentWithSlugFallbacks(
	baseUrl: string,
	kind: string,
	name: string,
): Promise<FetchedPage> {
	for (const slug of nameToSlugs(name)) {
		const fetched = await fetchPageContent(baseUrl, kind, slug);
		if (fetched.ok) return fetched;
	}

	return { ok: false, titleText: '', contentHtml: '' };
}

/** Fetch a page from slug-generated URLs until one compatible slug succeeds. */
export async function fetchPageAtUrlWithSlugFallbacks(
	name: string,
	buildUrl: (slug: string) => string,
): Promise<FetchedPage> {
	for (const slug of nameToSlugs(name)) {
		const fetched = await fetchPageAtUrl(buildUrl(slug));
		if (fetched.ok) return fetched;
	}

	return { ok: false, titleText: '', contentHtml: '' };
}

/** Fetch a page by a direct URL and extract its title and content. */
export async function fetchPageAtUrl(url: string): Promise<FetchedPage> {
	try {
		const res = await requestUrl({ url, method: 'GET' });
		if (res.status < 200 || res.status >= 300) return { ok: false, titleText: '', contentHtml: '' };
		const parser = new DOMParser();
		const doc = parser.parseFromString(res.text, 'text/html');
		const titleEl = doc.querySelector('.page-title.page-header') || doc.querySelector('.page-title');
		const contentEl = doc.querySelector('#page-content') || doc.querySelector('#wiki-content') || doc.body;
		const titleText = titleEl ? (titleEl.textContent || '').trim() : '';
		const missing = titleText.toLowerCase().includes('the page does not') || !titleEl || !contentEl;
		if (missing) return { ok: false, titleText: '', contentHtml: '' };

		const contentClone = contentEl.cloneNode(true) as HTMLElement;
		for (const element of Array.from(contentClone.querySelectorAll('div.floatright'))) element.remove();
		for (const anchor of Array.from(contentClone.querySelectorAll('a'))) {
			anchor.replaceWith(doc.createTextNode(anchor.textContent || ''));
		}
		return { ok: true, titleText, contentHtml: contentClone.innerHTML };
	} catch {
		return { ok: false, titleText: '', contentHtml: '' };
	}
}

/** Fetch a page with a single five-second retry. */
export async function fetchTitleAndBody(url: string): Promise<{ title: string; html: string } | null> {
	const attempt = async (): Promise<{ title: string; html: string } | null> => {
		try {
			const res = await requestUrl({ url, method: 'GET' });
			if (res.status < 200 || res.status >= 300) return null;
			const parser = new DOMParser();
			const doc = parser.parseFromString(res.text, 'text/html');
			const titleEl = doc.querySelector('.page-title');
			const contentEl = doc.querySelector('#page-content') || doc.querySelector('#wiki-content') || doc.body;
			return {
				title: (titleEl?.textContent || '').trim(),
				html: contentEl?.innerHTML || '',
			};
		} catch {
			return null;
		}
	};

	const first = await attempt();
	if (first) return first;
	await new Promise<void>((resolve) => window.setTimeout(resolve, 5000));
	return attempt();
}
