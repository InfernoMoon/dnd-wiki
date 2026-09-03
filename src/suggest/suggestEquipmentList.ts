import type { App, EditorSuggestContext } from 'obsidian';
import { STATIC_EQUIPMENT_TYPES } from '../data/staticData';
import { DndDirectiveSuggest } from './baseSuggest';
import { getTextSuggestions } from './suggestHelpers';

const EQUIPMENT_TYPES = ['All', ...STATIC_EQUIPMENT_TYPES];

/** Suggest equipment-list properties and their supported type values. */
export class EquipmentListSuggest extends DndDirectiveSuggest {
	constructor(appPlugin: { app: App }) {
		super(
			appPlugin,
			/^(?:```\s*dnd([a-z0-9]*)-equipmentlist\s*)$/i,
			['type'],
			['type'],
		);
	}

	getSuggestions(context: EditorSuggestContext): Array<{ text: string }> {
		const query = context.query || '';
		if (this.currentKey === 'type') {
			return getTextSuggestions(EQUIPMENT_TYPES, query, 'startsWith');
		}

		return getTextSuggestions(['type:'], query, 'startsWith');
	}
}
