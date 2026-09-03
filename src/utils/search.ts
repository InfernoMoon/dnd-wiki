import type { CachedRender } from '../cache/renderCache';

export type SearchMode = 'and' | 'or';

/** Parse all `search:` directives from a code block. */
export function parseSearchDirective(source: string): string[] {
	const results: string[] = [];
	const re = /^search:\s*(.+)$/gim;
	let match: RegExpExecArray | null;
	while ((match = re.exec(source)) !== null) {
		const term = match[1].trim().toLowerCase();
		if (term) results.push(term);
	}
	return results;
}

/** Parse `searchMode:` and default to `or`. */
export function parseSearchModeDirective(source: string): SearchMode {
	const match = /^searchMode:\s*(.+)$/im.exec(source);
	return match && match[1].trim().toLowerCase() === 'and' ? 'and' : 'or';
}

/** Test whether cached rendered content matches the requested search terms. */
export function matchesSearch(
	cached: CachedRender,
	searches: string[],
	searchMode: SearchMode,
): boolean {
	if (!searches.length) return true;

	const text = `${cached.title} ${cached.html
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')}`.toLowerCase();
	return matchesSearchText(text, searches, searchMode);
}

/** Test whether plain text contains the requested search terms. */
export function matchesSearchText(
	text: string,
	searches: string[],
	searchMode: SearchMode,
): boolean {
	if (!searches.length) return true;

	const normalizedText = text.toLowerCase();
	return searchMode === 'and'
		? searches.every(search => normalizedText.includes(search))
		: searches.some(search => normalizedText.includes(search));
}
