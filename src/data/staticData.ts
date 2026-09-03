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

export const STATIC_EQUIPMENT_TYPES: string[] = [
  "Armor and Shields",
  "Weapons"
];

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
	return STATIC_CLASSES.slice().sort((a, b) => a.localeCompare(b));
}

/** Return the supported spell schools in alphabetical order. */
export function getSchoolNames(): string[] {
	return STATIC_SCHOOLS.slice().sort((a, b) => a.localeCompare(b));
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
