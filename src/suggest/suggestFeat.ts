import type { App } from 'obsidian';
import { featIdCache } from '../dnd/feats/featService';
import { DndNameSuggest } from './baseSuggest';

export class FeatNameSuggest extends DndNameSuggest {
	constructor(appPlugin: { app: App }) {
		super(appPlugin, {
			blockPattern: /^(?:```\s*dnd([a-z0-9]*)-feat\s*)$/i,
			getIds: (urlKey) => featIdCache.get(urlKey),
		});
	}
}
