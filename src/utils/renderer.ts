import { createUid } from './obsidian';
import type { WikiCellTableData } from './wikiTable';

/** Check that a renderer has a configured base URL. */
export function requireBaseUrl(el: HTMLElement, baseUrl: string): boolean {
	if (baseUrl) return true;

	el.createDiv({ text: 'Base URL is not configured.' });
	return false;
}

/** Show a consistent message when a list has no visible results. */
export function renderNoResultsMessage(el: HTMLElement, itemLabel: string): void {
	el.createDiv({ text: `No ${itemLabel} found.` });
}

/** Render plain text rows in a table using the headers supplied by the source. */
export function renderTable(
	el: HTMLElement,
	headers: readonly string[],
	rows: readonly (readonly string[])[],
): void {
	const table = el.createEl('table', { cls: 'dnd-wiki-table' });
	const head = table.createEl('thead');
	const headerRow = head.createEl('tr');
	for (const header of headers) headerRow.createEl('th', { text: header });

	const body = table.createEl('tbody');
	for (const row of rows) {
		const tableRow = body.createEl('tr');
		for (let index = 0; index < headers.length; index++) {
			tableRow.createEl('td', { text: row[index] ?? '' });
		}
	}
}

/** Render a table whose rows retain whether each source cell was a header cell. */
export function renderCellTable(el: HTMLElement, table: WikiCellTableData): void {
	const renderedTable = el.createEl('table', { cls: 'dnd-wiki-table' });
	const body = renderedTable.createEl('tbody');

	for (const row of table.rows) {
		const renderedRow = body.createEl('tr');
		for (const cell of row) {
			renderedRow.createEl(cell.isHeader ? 'th' : 'td', { text: cell.text });
		}
	}
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
