import type { App } from 'obsidian';
import { itemIdCache } from '../dnd/items/itemService';
import { DndNameSuggest } from './baseSuggest';

export class ItemNameSuggest extends DndNameSuggest {
	constructor(appPlugin: { app: App }) {
		super(appPlugin, {
			blockPattern: /^(?:```\s*dnd([a-z0-9]*)-magicitem\s*)$/i,
			getIds: (urlKey) => itemIdCache.get(urlKey),
		});
	}
}
