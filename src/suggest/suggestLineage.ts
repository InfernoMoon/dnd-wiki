import type { App } from 'obsidian';
import { lineageIdCache } from '../dnd/lineages/lineageService';
import { getCachedHomebrewLineageIds } from '../homebrew/homebrewService';
import { DndNameSuggest } from './baseSuggest';

export class LineageNameSuggest extends DndNameSuggest {
	constructor(appPlugin: { app: App }) {
		super(appPlugin, {
			blockPattern: /^(?:```\s*dnd([a-z0-9]*)-lineage\s*)$/i,
			getIds: (urlKey) => Array.from(new Set([
				...lineageIdCache.get(urlKey),
				...getCachedHomebrewLineageIds(),
			])),
		});
	}
}
