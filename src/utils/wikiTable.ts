export type WikiTableHeaderMatcher = string | ((headerText: string) => boolean);

export interface WikiTableData {
	headers: string[];
	rows: string[][];
}

export function getWikiContentTables(
	root: Document | Element,
	headerMatcher?: WikiTableHeaderMatcher,
): WikiTableData[] {
	const tables: WikiTableData[] = [];
	for (const table of Array.from(root.querySelectorAll('table.wiki-content-table'))) {
		const allHeaders = Array.from(table.querySelectorAll('th'))
			.map(header => header.textContent?.trim() ?? '')
			.filter(Boolean);
		if (headerMatcher && !allHeaders.some(header => matchesHeader(header, headerMatcher))) continue;

		const headerRow = Array.from(table.querySelectorAll('tr'))
			.map((row, rowIndex) => ({
				row,
				rowIndex,
				headers: Array.from(row.querySelectorAll('th'))
					.map(header => header.textContent?.trim() ?? ''),
			}))
			.find(candidate => candidate.headers.some(header => header.toLowerCase() === 'name'));
		if (!headerRow) continue;

		const rows = Array.from(table.querySelectorAll('tr'))
			.slice(headerRow.rowIndex + 1)
			.map(row => Array.from(row.querySelectorAll('td')).map(cell => cell.textContent?.trim() ?? ''))
			.filter(row => row.length > 0);

		tables.push({ headers: headerRow.headers, rows });
	}
	return tables;
}

function matchesHeader(header: string, matcher: WikiTableHeaderMatcher): boolean {
	if (typeof matcher === 'function') return matcher(header);
	return header.trim().toLowerCase() === matcher.trim().toLowerCase();
}
