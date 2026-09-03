import type { App, EditorSuggestContext } from 'obsidian';
import { STATIC_WEAPON_TYPES } from '../data/staticData';
import { DndDirectiveSuggest } from './baseSuggest';
import { getTextSuggestions } from './suggestHelpers';

const WEAPON_TYPES = ['All', ...Array.from(STATIC_WEAPON_TYPES.values())];

/** Suggest weapon-list properties and supported weapon types. */
export class WeaponListSuggest extends DndDirectiveSuggest {
	constructor(appPlugin: { app: App }) {
			super(
			appPlugin,
			/^(?:```\s*dnd([a-z0-9]*)-weaponlist\s*)$/i,
			['type'],
			['type', 'searchmode'],
		);
	}

	getSuggestions(context: EditorSuggestContext): Array<{ text: string }> {
		const query = context.query || '';
		if (this.currentKey === 'type') {
			return getTextSuggestions(WEAPON_TYPES, query, 'startsWith');
		}

		if (this.currentKey === 'searchmode') {
			return getTextSuggestions(['Or', 'And'], query, 'startsWith');
		}

		return this.getDirectiveSuggestions(context, ['type:', 'search:', 'searchMode:']);
	}
}
