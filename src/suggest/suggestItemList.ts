import type { App, EditorSuggestContext } from 'obsidian';
import { getItemTypeSuggestions } from '../dnd/items/itemService';
import { DndDirectiveSuggest } from './baseSuggest';
import { getTextSuggestions } from './suggestHelpers';

export class ItemListSuggest extends DndDirectiveSuggest {
	constructor(appPlugin: { app: App }) {
		super(appPlugin, /^(?:```\s*dnd([a-z0-9]*)-magicitemlist\s*)$/i, ['type']);
	}

	getSuggestions(context: EditorSuggestContext): Array<{ text: string }> {
		const query = context.query || '';

		if (!this.currentKey) {
			return getTextSuggestions(
				['level:', 'type:', 'attuned:', 'search:', 'searchMode:'],
				query,
				'startsWith',
			);
		}
		if (this.currentKey === 'level') {
			return getTextSuggestions(
				['All', 'Common', 'Uncommon', 'Rare', 'Very-Rare', 'Legendary', 'Artifact', 'Unique', 'Other'],
				query,
				'startsWith',
			);
		}
		if (this.currentKey === 'type') {
			return getTextSuggestions(getItemTypeSuggestions(), query);
		}
		if (this.currentKey === 'searchmode') {
			return getTextSuggestions(['Or', 'And'], query, 'startsWith');
		}
		if (this.currentKey === 'attuned') {
			return getTextSuggestions(['All', 'Required', 'Not-Required'], query, 'startsWith');
		}
		return [];
	}
}
