import type { App } from 'obsidian';
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

/**
 * Minimal HTML escaping for text fragments.
 */
export function escapeHtml(s: string): string {
	return s.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
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
		// Remove floatright sidebars (infoboxes, images, etc.)
		for (const el of Array.from(contentClone.querySelectorAll('div.floatright'))) {
			el.remove();
		}
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

// Shared collapsible renderer used by spells (and can be reused elsewhere)
export function renderCollapsible(el: HTMLElement, title: string, html: string) {
	const uid = createUid();
	const contentDivId = `card-content-${uid}`;
	const arrowId = `card-arrow-${uid}`;
	el.innerHTML = `
		<div style="display:flex; align-items:center; cursor:pointer;" id="title-${contentDivId}">
			<span style="margin-right:0.5em;" id="${arrowId}">▼</span>
			<span style="font-size: 1.1em; font-weight: 600; margin:0;">${title}</span>
		</div>
		<div id="${contentDivId}" style="display:none; margin-top:0.5em;">${html}</div>
	`;
	const titleDiv = el.querySelector(`#title-${contentDivId}`);
	const contentDiv = el.querySelector(`#${contentDivId}`);
	const arrow = el.querySelector(`#${arrowId}`);
	if (!titleDiv || !contentDiv || !arrow) return;
	titleDiv.addEventListener('click', () => {
		const c = contentDiv as HTMLElement;
		const a = arrow as HTMLElement;
		const isHidden = c.style.display === 'none';
		c.style.display = isHidden ? 'block' : 'none';
		a.textContent = isHidden ? '▲' : '▼';
	});
}

/**
 * Safely obtain the Obsidian App instance from global scope.
 */
export function getObsidianApp(): App | null {
	return (globalThis as unknown as { app?: App }).app ?? null;
}

/**
 * Create a unique identifier using crypto when available.
 * Falls back to a timestamp-based seed.
 */
export function createUid(): string {
	try {
		const anyCrypto = (globalThis as unknown as { crypto?: Crypto }).crypto;
		if (anyCrypto && 'randomUUID' in anyCrypto && typeof anyCrypto.randomUUID === 'function') {
			return anyCrypto.randomUUID();
		}
		if (anyCrypto && 'getRandomValues' in anyCrypto && typeof anyCrypto.getRandomValues === 'function') {
			const buf = new Uint8Array(16);
			anyCrypto.getRandomValues(buf);
			return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
		}
	} catch {
		// fall through to non-crypto fallback
	}
	return `uid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Extract the inner HTML of a collapsible card content block.
 */
export function extractCardContentHtml(host: HTMLElement): string | null {
	const contentDiv = host.querySelector('div[id^="card-content-"]');
	return contentDiv?.innerHTML || null;
}

/**
 * Extract non-empty names from the first table cell of each row.
 * Used by both spell and item list processors to normalize name collection.
 */
export function extractTableNamesFromFirstCell(root: Document | Element): string[] {
	const rows = Array.from(root.querySelectorAll('table tr'));
	return rows
		.map((tr) => tr.querySelector('td'))
		.filter((td) => !!td && !!td.textContent && td.textContent.trim().length > 0)
		.map((td) => (td?.textContent || '').trim());
}
// Fetch a page and extract title (.page-title) and body (#page-content)
// Falls back to #wiki-content or document.body if needed
export async function fetchTitleAndBody(url: string): Promise<{ title: string; html: string } | null> {
	const attempt = async (): Promise<{ title: string; html: string } | null> => {
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
	};
	const first = await attempt();
	if (first) return first;
	// Retry once after 5 seconds
	await new Promise(resolve => setTimeout(resolve, 5000));
	return attempt();
}
