import type { App } from 'obsidian';
import { backgroundIdCache } from '../dnd/backgrounds/backgroundService';
import { DndNameSuggest } from './baseSuggest';

export class BackgroundNameSuggest extends DndNameSuggest {
	constructor(appPlugin: { app: App }) {
		super(appPlugin, {
			blockPattern: /^(?:```\s*dnd([a-z0-9]*)-background\s*)$/i,
			getIds: (urlKey) => backgroundIdCache.get(urlKey),
		});
	}
}
