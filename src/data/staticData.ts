export const STATIC_CLASSES: string[] = [
  "Artificer",
  "Barbarian",
  "Bard",
  "Blood Hunter",
  "Cleric",
  "Druid",
  "Fighter",
  "Monk",
  "Paladin",
  "Ranger",
  "Rogue",
  "Sorcerer",
  "Warlock",
  "Wizard"
];

export const STATIC_SCHOOLS: string[] = [
  "Abjuration",
  "Conjuration",
  "Divination",
  "Enchantment",
  "Evocation",
  "Illusion",
  "Necromancy",
  "Transmutation"
];

export const STATIC_ITEM_TYPES: string[] = [
  "Armor",
  "Potion",
  "Ring",
  "Rod",
  "Scroll",
  "Staff",
  "Wand",
  "Weapon",
  "Wondrous Item"
];

let homebrewSuggestionValues = {
  classes: [] as string[],
  magicSchools: [] as string[],
  weaponTypes: [] as string[],
  magicItemTypes: [] as string[],
};

/** Configure extra suggestion values supplied through the homebrew settings. */
export function setHomebrewSuggestionValues(values: {
  classes: string[];
  magicSchools: string[];
  weaponTypes: string[];
  magicItemTypes: string[];
}): void {
  homebrewSuggestionValues = {
    classes: values.classes,
    magicSchools: values.magicSchools,
    weaponTypes: values.weaponTypes,
    magicItemTypes: values.magicItemTypes,
  };
}

/** Equipment type IDs mapped to their display names. */
export const STATIC_EQUIPMENT_TYPES = new Map<string, string>([
  ["armor", "Armor and Shields"],
  ["weapons", "Weapons"],
]);

/** Weapon type IDs mapped to their display names. */
export const STATIC_WEAPON_TYPES = new Map<string, string>([
  ["simple-melee", "Simple Melee"],
  ["simple-ranged", "Simple Ranged"],
  ["martial-melee", "Martial Melee"],
  ["martial-ranged", "Martial Ranged"],
  ["ammunition", "Ammunition"],
]);

export const STATIC_ITEM_RARITY_WORD_TO_INDEX: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  'very-rare': 3,
  legendary: 4,
  artifact: 5,
  unique: 6,
  other: 7,
};

/** Return the supported D&D class names in alphabetical order. */
export function getClassNames(): string[] {
	return uniqueSorted([...STATIC_CLASSES, ...homebrewSuggestionValues.classes]);
}

/** Return the supported spell schools in alphabetical order. */
export function getSchoolNames(): string[] {
	return uniqueSorted([...STATIC_SCHOOLS, ...homebrewSuggestionValues.magicSchools]);
}

/** Return weapon types, including custom homebrew suggestion values. */
export function getWeaponTypeNames(): string[] {
	return uniqueSorted([...STATIC_WEAPON_TYPES.values(), ...homebrewSuggestionValues.weaponTypes]);
}

/** Return custom magic item types supplied through the homebrew settings. */
export function getHomebrewMagicItemTypes(): string[] {
	return homebrewSuggestionValues.magicItemTypes;
}

/** Return display-friendly item rarity names in canonical order. */
export function getItemRarityNames(): string[] {
	const entries = Object.entries(STATIC_ITEM_RARITY_WORD_TO_INDEX);
	entries.sort((a, b) => a[1] - b[1]);
	return entries.map(([key]) => key.split('-').map(capitalizeWord).join('-'));
}

function capitalizeWord(word: string): string {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

function uniqueSorted(values: string[]): string[] {
	return Array.from(new Map(values
		.map(value => value.trim())
		.filter(Boolean)
		.map(value => [value.toLowerCase(), value] as const)).values())
		.sort((a, b) => a.localeCompare(b));
}
