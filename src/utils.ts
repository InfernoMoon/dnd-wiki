export function nameToSlug(name: string): string {
	if (!name) return "";
	let id = name;
	// Remove "(UA)" markers from spell names
	id = id.replace(/\(\s*ua\s*\)/gi, "");
	id = id.trim().toLowerCase();
	// Avoid replaceAll to keep compatibility; sequential regex replaces are fine
	id = id.replace(/\//g, "-");
	id = id.replace(/\s+/g, "-");
	id = id.replace(/[^a-z0-9-]/g, "");
	id = id.replace(/-+/g, "-");
	// trim leading/trailing hyphens
	id = id.replace(/^-+/, "");
	id = id.replace(/-+$/, "");
	return id;
}

export function displayNameFromSlug(slug: string): string {
	if (!slug) return "";
	return slug
		.split("-")
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}
