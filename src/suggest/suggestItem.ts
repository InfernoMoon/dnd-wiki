import type { App } from 'obsidian';
import { itemIdCache } from '../dnd/items/itemService';
import { getCachedHomebrewItemIds } from '../homebrew/homebrewService';
import { DndNameSuggest } from './baseSuggest';

export class ItemNameSuggest extends DndNameSuggest {
	constructor(appPlugin: { app: App }) {
		super(appPlugin, {
			blockPattern: /^(?:```\s*dnd([a-z0-9]*)-magicitem\s*)$/i,
			getIds: (urlKey) => Array.from(new Set([
				...itemIdCache.get(urlKey),
				...getCachedHomebrewItemIds(),
			])),
		});
	}
}
