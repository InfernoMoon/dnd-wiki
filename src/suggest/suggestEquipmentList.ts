import type { App, EditorSuggestContext } from 'obsidian';
import { getWeaponTypeNames, STATIC_EQUIPMENT_TYPES } from '../data/staticData';
import { DndDirectiveSuggest } from './baseSuggest';
import { getBlockPropertyValues, getTextSuggestions } from './suggestHelpers';

const EQUIPMENT_TYPES = ['All', ...Array.from(STATIC_EQUIPMENT_TYPES.values())];

/** Suggest equipment-list properties and their supported type values. */
export class EquipmentListSuggest extends DndDirectiveSuggest {
	constructor(appPlugin: { app: App }) {
		super(
			appPlugin,
			/^(?:```\s*dnd([a-z0-9]*)-equipmentlist\s*)$/i,
			['type', 'weapontype'],
			['type', 'weapontype'],
			getEquipmentAdditionalProperties,
		);
	}

	getSuggestions(context: EditorSuggestContext): Array<{ text: string }> {
		const query = context.query || '';
		if (this.currentKey === 'type') {
			return getTextSuggestions(EQUIPMENT_TYPES, query, 'startsWith');
		}
		if (this.currentKey === 'weapontype') {
			return getTextSuggestions(getWeaponTypeNames(), query, 'startsWith');
		}

		return this.getDirectiveSuggestions(context, ['type:']);
	}
}

function getEquipmentAdditionalProperties(context: EditorSuggestContext): string[] {
	const typeValues = getBlockPropertyValues(context, 'type');
	const includesWeapons = typeValues.some(value => value
		.split(',')
		.map(type => type.trim().toLowerCase().replace(/\s+/g, '-'))
		.some(type => type === 'all' || type === 'weapon' || type === 'weapons'));
	return includesWeapons ? ['weapontype:'] : [];
}
