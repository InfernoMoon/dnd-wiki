function normalizeSlug(name: string): string {
	if (!name) return '';
	let id = name.trim().toLowerCase();
	id = id.split('(ua)').join('');
	id = id.split('/').join('-');
	id = id.split(':').join('-');
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

	const canonicalSlug = normalizeSlug(name);
	const separatedApostropheSlug = normalizeSlug(name.replace(/[\u0027\u2019]/g, '-'));

	return Array.from(new Set([canonicalSlug, separatedApostropheSlug].filter(Boolean)));
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
