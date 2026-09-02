import type { App } from 'obsidian';
import { lineageIdCache } from '../dnd/lineages/lineageService';
import { DndNameSuggest } from './baseSuggest';

export class LineageNameSuggest extends DndNameSuggest {
	constructor(appPlugin: { app: App }) {
		super(appPlugin, {
			blockPattern: /^(?:```\s*dnd([a-z0-9]*)-lineage\s*)$/i,
			getIds: (urlKey) => lineageIdCache.get(urlKey),
		});
	}
}
