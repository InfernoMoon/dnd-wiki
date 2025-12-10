/**
 * Convert a formatted name into a normalized slug.
 * - Removes "(UA)" markers
 * - Lowercases
 * - Replaces spaces and some punctuation with dashes
 * - Removes other non-alphanumeric
 * - Collapses multiple dashes and trims leading/trailing dashes
 */
export function nameToSlug(name: string): string {
	if (!name) return "";
	let id = name.trim().toLowerCase();
	// Remove "(UA)" markers from spell names using a safe pass
	id = id.split("(ua)").join("");
	// Replace all '/' with '-'
	id = id.split("/").join("-");
	// Replace all ':' with '-'
	id = id.split(":").join("-");
	// Collapse whitespace groups to single '-'
	id = id.split(/\s+/).filter(Boolean).join("-");
	// Remove non [a-z0-9-]
	id = id
		.split("")
		.filter((ch: string) => /[a-z0-9-]/.test(ch))
		.join("");
	// Collapse multiple '-' to single '-'
	id = id.split("-").filter(Boolean).join("-");
	// Trim leading/trailing hyphens without String#replace
	while (id.startsWith("-")) id = id.slice(1);
	while (id.endsWith("-")) id = id.slice(0, -1);
	return id;
}

/**
 * Convert a slug back into a display name by capitalizing words and
 * replacing dashes with spaces.
 */
export function displayNameFromSlug(slug: string): string {
	if (!slug) return "";
	const words = slug.split("-").filter(Boolean);
	const titled = words.map((w: string) => w.charAt(0).toUpperCase() + w.slice(1));
	return titled.join(" ");
}

// Generic page fetcher for wiki-like pages (spell, feat, etc.)
// Builds URL as `${baseUrlNoTrailing}/${kind}:${id}` and extracts title/body.
// Also sanitizes anchors in the body by replacing <a> with <span> text nodes.
import { requestUrl } from 'obsidian';

export async function fetchPageContent(
	baseUrl: string,
	kind: string,
	id: string
): Promise<{ ok: boolean; titleText: string; contentHtml: string }> {
	const base = baseUrl.replace(/\/$/, '');
	const url = `${base}/${kind}:${id}`;
	try {
		const res = await requestUrl({ url, method: 'GET' });
		if (res.status < 200 || res.status >= 300) return { ok: false, titleText: '', contentHtml: '' };
		const html = res.text;
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		const titleEl = doc.querySelector('.page-title.page-header') || doc.querySelector('.page-title');
		const contentEl = doc.querySelector('#page-content') || doc.querySelector('#wiki-content') || doc.body;
		const titleText = titleEl ? (titleEl.textContent || '').trim() : '';
		const missing = titleText.toLowerCase().includes('the page does not') || !titleEl || !contentEl;
		if (missing) return { ok: false, titleText: '', contentHtml: '' };
		const contentClone = contentEl.cloneNode(true) as HTMLElement;
		const links = contentClone.querySelectorAll('a');
		for (const a of Array.from(links)) {
			const span = doc.createElement('span');
			span.textContent = a.textContent || '';
			a.replaceWith(span);
		}
		return { ok: true, titleText, contentHtml: contentClone.innerHTML };
	} catch {
		return { ok: false, titleText: '', contentHtml: '' };
	}
}

// Fetch a page and extract title (.page-title) and body (#page-content)
// Falls back to #wiki-content or document.body if needed
export async function fetchTitleAndBody(url: string): Promise<{ title: string; html: string } | null> {
	try {
		const { requestUrl } = await import('obsidian');
		const res = await requestUrl({ url, method: 'GET' });
		if (res.status < 200 || res.status >= 300) return null;
		const parser = new DOMParser();
		const doc = parser.parseFromString(res.text, 'text/html');
		const titleEl = doc.querySelector('.page-title');
		const contentEl = doc.querySelector('#page-content') || doc.querySelector('#wiki-content') || doc.body;
		const title = (titleEl?.textContent || '').trim();
		const html = contentEl?.innerHTML || '';
		return { title, html };
	} catch {
		return null;
	}
}
