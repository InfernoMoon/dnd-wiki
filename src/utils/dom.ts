/** Extract non-empty names from the first table cell of each row. */
export function extractTableNamesFromFirstCell(root: Document | Element): string[] {
	const rows = Array.from(root.querySelectorAll('table tr'));
	return rows
		.map((row) => row.querySelector('td'))
		.filter((cell) => !!cell && !!cell.textContent && cell.textContent.trim().length > 0)
		.map((cell) => (cell?.textContent || '').trim());
}
