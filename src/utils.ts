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
