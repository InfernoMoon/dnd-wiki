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
