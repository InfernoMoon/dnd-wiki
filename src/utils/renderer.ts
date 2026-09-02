import { createUid } from './obsidian';

/** Check that a renderer has a configured base URL. */
export function requireBaseUrl(el: HTMLElement, baseUrl: string): boolean {
	if (baseUrl) return true;

	el.createDiv({ text: 'Base URL is not configured.' });
	return false;
}

/** Prepare line-separated names or IDs for a renderer. */
export function prepareNameInput(
	el: HTMLElement,
	source: string,
	baseUrl: string,
	emptySourceMessage: string,
): string[] | null {
	el.empty();
	if (!requireBaseUrl(el, baseUrl)) return null;

	const lines = source.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
	if (!lines.length) {
		el.createDiv({ text: emptySourceMessage });
		return null;
	}

	return lines;
}

function appendHtmlFragment(container: HTMLElement, html: string): void {
	const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
	const root = parsed.body.firstElementChild;
	if (!root) return;

	for (const child of Array.from(root.childNodes)) {
		container.appendChild(document.importNode(child, true));
	}
}

/** Render one clickable, collapsible card. */
export function renderCollapsible(el: HTMLElement, title: string, html: string): void {
	const uid = createUid();
	const contentDivId = `card-content-${uid}`;
	const arrowId = `card-arrow-${uid}`;
	el.empty();

	const titleDiv = el.createDiv('dnd-wiki-card-title');
	titleDiv.id = `title-${contentDivId}`;

	const arrow = titleDiv.createSpan('dnd-wiki-card-arrow');
	arrow.id = arrowId;
	arrow.textContent = '▼';

	const titleText = titleDiv.createSpan('dnd-wiki-card-title-text');
	titleText.textContent = title;

	const contentDiv = el.createDiv('dnd-wiki-card-content');
	contentDiv.id = contentDivId;
	appendHtmlFragment(contentDiv, html);
	titleDiv.addEventListener('click', () => {
		const isHidden = !contentDiv.classList.contains('dnd-wiki-card-content-visible');
		contentDiv.classList.toggle('dnd-wiki-card-content-visible', isHidden);
		arrow.textContent = isHidden ? '▲' : '▼';
	});
}
