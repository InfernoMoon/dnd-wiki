/**
 * Get values for selected colon-separated properties in plain text.
 *
 * Property names are matched case-insensitively, while the returned map keeps
 * the property spelling supplied by the caller.
 */
export function getTextProperties(
	source: string,
	properties: string[],
): Map<string, string[]> {
	const result = new Map<string, string[]>();
	const propertyNames = new Map<string, string>();

	for (const property of properties) {
		result.set(property, []);
		propertyNames.set(property.toLowerCase(), property);
	}

	for (const line of source.split(/\r?\n/)) {
		const match = /^([\w-]+):\s*(.*)$/.exec(line.trim());
		if (!match) continue;

		const property = propertyNames.get(match[1].toLowerCase());
		if (!property) continue;

		result.get(property)?.push(match[2].trim());
	}

	return result;
}
