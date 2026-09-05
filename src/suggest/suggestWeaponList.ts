import type { App, EditorSuggestContext } from 'obsidian';
import {
	getKnownWeaponMasteriesForKey,
	getKnownWeaponPropertiesForKey,
} from '../dnd/weapons/weaponService';
import { getWeaponTypeNames } from '../data/staticData';
import { is2024Source } from '../utils/wikiPageFetcher';
import { DndDirectiveSuggest } from './baseSuggest';
import { getTextSuggestions } from './suggestHelpers';

/** Suggest weapon-list properties and supported weapon types. */
export class WeaponListSuggest extends DndDirectiveSuggest {
	constructor(appPlugin: { app: App }, private readonly getBaseUrl: (urlKey: string) => string) {
			super(
			appPlugin,
			/^(?:```\s*dnd([a-z0-9]*)-weaponlist\s*)$/i,
			['type', 'property', 'mastery'],
			['type', 'property', 'mastery', 'showpropertytable', 'showmasterytable', 'searchmode'],
		);
	}

	getSuggestions(context: EditorSuggestContext): Array<{ text: string }> {
		const query = context.query || '';
		if (this.currentKey === 'type') {
			return getTextSuggestions(['All', ...getWeaponTypeNames()], query, 'startsWith');
		}
		if (this.currentKey === 'property') {
			return getTextSuggestions(
				getKnownWeaponPropertiesForKey(this.currentUrlKey),
				query,
				'startsWith',
			);
		}
		if (this.currentKey === 'mastery') {
			if(is2024Source(this.getBaseUrl(this.currentUrlKey)))
				return [];

			return getTextSuggestions(
				getKnownWeaponMasteriesForKey(this.currentUrlKey),
				query,
				'startsWith',
			);
		}
		if (this.currentKey === 'showpropertytable') {
			return getTextSuggestions(['Show', 'Hide', 'Only'], query, 'startsWith');
		}
		if (this.currentKey === 'showmasterytable') {
			return is2024Source(this.getBaseUrl(this.currentUrlKey))
				? getTextSuggestions(['Show', 'Hide', 'Only'], query, 'startsWith')
				: [];
		}

		if (this.currentKey === 'searchmode') {
			return getTextSuggestions(['Or', 'And'], query, 'startsWith');
		}

		const properties = ['type:', 'property:'];
		if (is2024Source(this.getBaseUrl(this.currentUrlKey))) properties.push('mastery:');
		properties.push('showPropertyTable:');
		if (is2024Source(this.getBaseUrl(this.currentUrlKey))) properties.push('showMasteryTable:');
		properties.push('search:', 'searchMode:');
		return this.getDirectiveSuggestions(context, properties);
	}
}
