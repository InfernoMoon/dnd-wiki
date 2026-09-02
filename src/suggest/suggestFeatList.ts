import type { App } from 'obsidian';
import { SearchListSuggest } from './baseSuggest';

export class FeatListSuggest extends SearchListSuggest {
	constructor(appPlugin: { app: App }) {
		super(appPlugin, /^(?:```\s*dnd([a-z0-9]*)-featlist\s*)$/i);
	}
}
