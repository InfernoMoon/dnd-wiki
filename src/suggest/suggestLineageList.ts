import type { App } from 'obsidian';
import { SearchListSuggest } from './baseSuggest';

export class LineageListSuggest extends SearchListSuggest {
	constructor(appPlugin: { app: App }) {
		super(appPlugin, /^(?:```\s*dnd([a-z0-9]*)-lineagelist\s*)$/i);
	}
}
