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
export function parseSearchModeDirective(source: string): 'and' | 'or' {
	const match = /^searchMode:\s*(.+)$/im.exec(source);
	return match && match[1].trim().toLowerCase() === 'and' ? 'and' : 'or';
}

/** Test whether a name or optional cached HTML contains a search term. */
export function matchesSearch(name: string, search: string, cachedHtml?: string): boolean {
	if (!search) return true;
	if (name.toLowerCase().includes(search)) return true;
	if (!cachedHtml) return false;
	const text = cachedHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').toLowerCase();
	return text.includes(search);
}
