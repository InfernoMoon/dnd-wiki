function normalizeSlug(name: string): string {
	if (!name) return '';
	let id = name.trim().toLowerCase();
	id = id.split('/').join('-');
	id = id.split(':').join('-');
	id = id.split(',').join('-');
	id = id.split(/\s+/).filter(Boolean).join('-');
	id = id.split('').filter((ch: string) => /[a-z0-9-]/.test(ch)).join('');
	id = id.split('-').filter(Boolean).join('-');
	while (id.startsWith('-')) id = id.slice(1);
	while (id.endsWith('-')) id = id.slice(0, -1);
	return id;
}

/** Return the canonical slug and compatible alternate slug forms. */
export function nameToSlugs(name: string): string[] {
	if (!name) return [];

	const names: string[] = [];
	const withoutParentheses = name.replace(/\s*\([^)]*\)/g, '').trim();
	// Parenthesis option 1: remove the parentheses and their contents.
	if (withoutParentheses) names.push(withoutParentheses);

	const parentheticalContents = getParentheticalContents(name);
	// Parenthesis option 2: use only the text inside the parentheses.
	if (parentheticalContents) names.push(parentheticalContents);
	// Parenthesis option 3: remove only the parentheses and keep their contents.
	if (parentheticalContents) names.push(name);

	const commaIndex = withoutParentheses.indexOf(',');
	if (commaIndex !== -1) names.push(withoutParentheses.slice(0, commaIndex));

	const slugs: string[] = [];
	for (const candidateName of names) {
		// Normalize the current name candidate, including commas as separators.
		slugs.push(normalizeSlug(candidateName));
		// Some wiki pages separate an apostrophe from the following word with a hyphen.
		slugs.push(normalizeSlug(candidateName.replace(/[\u0027\u2019]/g, '-')));
	}

	return Array.from(new Set(slugs.filter(Boolean)));
}

function getParentheticalContents(name: string): string {
	const contents: string[] = [];
	const pattern = /\(([^)]*)\)/g;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(name)) !== null) {
		const content = match[1].trim();
		if (content) contents.push(content);
	}

	return contents.join(' ');
}

/** Return the first, canonical slug for APIs that require one stable key. */
export function getPrimarySlug(name: string): string {
	return nameToSlugs(name)[0] ?? '';
}

const UPPERCASE_WORDS = new Set(['ua']);

/** Convert a slug back into a display name. */
export function displayNameFromSlug(slug: string): string {
	if (!slug) return '';
	const words = slug.split('-').filter(Boolean);
	return words
		.map((word: string) => UPPERCASE_WORDS.has(word.toLowerCase())
			? word.toUpperCase()
			: word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/** Escape the HTML characters used in text fragments. */
export function escapeHtml(value: string): string {
	return value.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
}
