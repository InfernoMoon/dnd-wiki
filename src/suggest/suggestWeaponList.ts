import type { App, EditorSuggestContext } from 'obsidian';
import { STATIC_WEAPON_MASTERY, STATIC_WEAPON_PROPERTIES, STATIC_WEAPON_TYPES } from '../data/staticData';
import { is2024Source } from '../utils/wikiPageFetcher';
import { DndDirectiveSuggest } from './baseSuggest';
import { getTextSuggestions } from './suggestHelpers';

const WEAPON_TYPES = ['All', ...Array.from(STATIC_WEAPON_TYPES.values())];

/** Suggest weapon-list properties and supported weapon types. */
export class WeaponListSuggest extends DndDirectiveSuggest {
	constructor(appPlugin: { app: App }, private readonly getBaseUrl: (urlKey: string) => string) {
			super(
			appPlugin,
			/^(?:```\s*dnd([a-z0-9]*)-weaponlist\s*)$/i,
			['type', 'property', 'mastery'],
			['type', 'property', 'mastery', 'searchmode'],
		);
	}

	getSuggestions(context: EditorSuggestContext): Array<{ text: string }> {
		const query = context.query || '';
		if (this.currentKey === 'type') {
			return getTextSuggestions(WEAPON_TYPES, query, 'startsWith');
		}
		if (this.currentKey === 'property') {
			return getTextSuggestions(STATIC_WEAPON_PROPERTIES, query, 'startsWith');
		}
		if (this.currentKey === 'mastery') {
			return is2024Source(this.getBaseUrl(this.currentUrlKey))
				? getTextSuggestions(STATIC_WEAPON_MASTERY, query, 'startsWith')
				: [];
		}

		if (this.currentKey === 'searchmode') {
			return getTextSuggestions(['Or', 'And'], query, 'startsWith');
		}

		const properties = ['type:', 'property:', 'search:', 'searchMode:'];
		if (is2024Source(this.getBaseUrl(this.currentUrlKey))) properties.splice(2, 0, 'mastery:');
		return this.getDirectiveSuggestions(context, properties);
	}
}
