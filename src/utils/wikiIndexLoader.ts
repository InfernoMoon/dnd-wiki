import { requestUrl } from 'obsidian';
import { getPrimarySlug } from './text';

export interface LoaderConfig {
	baseUrl: string;

	/** Path to index page for table parsing (e.g., "/feats", "/spells") */
	indexPath: string;

	/** Regex pattern to match in href attributes. Must have one capture group. */
	linkPattern?: RegExp;

	/** CSS selector for table rows (default: "table tr") */
	tableRowSelector?: string;

	/** CSS selector for cell containing the name within a row (default: "td") */
	tableCellSelector?: string;

	/** Custom filter function to exclude entries. Return true to keep, false to exclude. */
	filterFn?: (name: string) => boolean;

	/** Replace patterns used to clean up names. */
	replacePatterns?: Array<[string, string]>;

	/** Optional callback invoked for each table row after name extraction and filtering. */
	rowProcessor?: (row: Element, name: string) => void;
}

/**
 * Load data using link-based parsing.
 * Fetches the root page and extracts matching anchor IDs.
 */
export async function loadFromLinks(config: LoaderConfig): Promise<Set<string>> {
	const results = new Set<string>();
	const base = config.baseUrl.replace(/\/$/, '');

	try {
		const res = await requestUrl({ url: `${base}/`, method: 'GET' });
		if (res.status < 200 || res.status >= 300) return results;

		const parser = new DOMParser();
		const doc = parser.parseFromString(res.text, 'text/html');
		const anchors = Array.from(doc.querySelectorAll('a[href]'));

		for (const anchor of anchors) {
			const href = anchor.getAttribute('href') || '';
			if (!config.linkPattern) continue;
			const match = config.linkPattern.exec(href);
			if (!match?.[1]) continue;

			const name = match[1];
			if (config.filterFn && !config.filterFn(name)) continue;

			const id = getPrimarySlug(name);
			if (id) results.add(id);
		}
	} catch (error) {
		console.warn(`Failed to load data via link-based method from ${base}`, error);
	}

	return results;
}

/**
 * Load data using table-based parsing.
 * Fetches an index page and parses IDs from its structured rows.
 */
export async function loadFromTable(config: LoaderConfig): Promise<Set<string>> {
	const results = new Set<string>();
	const base = config.baseUrl.replace(/\/$/, '');
	const rowSelector = config.tableRowSelector || 'table tr';
	const cellSelector = config.tableCellSelector || 'td';

	try {
		const res = await requestUrl({ url: `${base}${config.indexPath}`, method: 'GET' });
		if (res.status < 200 || res.status >= 300) return results;

		const parser = new DOMParser();
		const doc = parser.parseFromString(res.text, 'text/html');
		const rows = Array.from(doc.querySelectorAll(rowSelector));

		for (const row of rows) {
			const cell = row.querySelector(cellSelector);
			if (!cell?.textContent?.trim()) continue;

			let name = cell.textContent.trim();
			if (config.replacePatterns) {
				for (const [search, replace] of config.replacePatterns) {
					name = name.split(search).join(replace);
				}
				name = name.trim();
			}

			if (config.filterFn && !config.filterFn(name)) continue;

			const id = getIdFromTableRow(row, name);
			if (id) results.add(id);
			if (id && config.rowProcessor) config.rowProcessor(row, name);
		}
	} catch (error) {
		console.warn(`Failed to load data via table-based method from ${base}${config.indexPath}`, error);
	}

	return results;
}

function getIdFromTableRow(row: Element, name: string): string {
	const href = row.querySelector('a[href]')?.getAttribute('href') || '';
	const match = /:([^/:?#]+)(?:[?#].*)?$/.exec(href);
	if (match?.[1]) {
		try {
			return getPrimarySlug(decodeURIComponent(match[1]));
		} catch {
			return getPrimarySlug(match[1]);
		}
	}
	return getPrimarySlug(name);
}
