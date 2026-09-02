import type { App, EditorSuggestContext } from 'obsidian';
import { getClassNames, getSchoolNames } from '../data/staticData';
import { getKnownSpellIdsForKey } from '../dnd/spells/spellUtils';
import { displayNameFromSlug } from '../utils/text';
import { DndDirectiveSuggest } from './baseSuggest';
import { getTextSuggestions } from './suggestHelpers';

export class SpellListSuggest extends DndDirectiveSuggest {
	constructor(appPlugin: { app: App }) {
		super(
			appPlugin,
			/^(?:```\s*dnd([a-z0-9]*)-spelllist\s*)$/i,
			['class', 'school', 'addspells', 'removespells'],
		);
	}

	getSuggestions(context: EditorSuggestContext): Array<{ text: string }> {
		const query = context.query || '';

		if (!this.currentKey) {
			return getTextSuggestions(
				['level:', 'class:', 'school:', 'addspells:', 'removespells:', 'search:', 'searchMode:'],
				query,
				'startsWith',
			);
		}
		if (this.currentKey === 'level') {
			return getTextSuggestions(['all', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], query, 'startsWith');
		}
		if (this.currentKey === 'class') {
			return getTextSuggestions(getClassNames(), query);
		}
		if (this.currentKey === 'school') {
			return getTextSuggestions(getSchoolNames(), query);
		}
		if (this.currentKey === 'searchmode') {
			return getTextSuggestions(['Or', 'And'], query, 'startsWith');
		}
		if (this.currentKey === 'addspells' || this.currentKey === 'removespells') {
			const names = getKnownSpellIdsForKey(this.currentUrlKey).map(displayNameFromSlug);
			return getTextSuggestions(names, query);
		}
		return [];
	}
}
