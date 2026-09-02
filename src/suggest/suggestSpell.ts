import type { App, Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import { displayNameFromSlug } from '../utils/text';
import { getKnownSpellIdsForKey } from '../dnd/spells/spellUtils';
import { BaseTextSuggest } from './baseSuggest';
import { findDndCodeBlock, getTextSuggestions } from './suggestHelpers';

export class SpellNameSuggest extends BaseTextSuggest {
	private currentUrlKey = '';

	constructor(appPlugin: { app: App }) {
		super(appPlugin.app);
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		try {
			const line = editor.getLine(cursor.line);
			if (line.trim().startsWith('```')) return null;

			const blockMatch = findDndCodeBlock(cursor, editor, /^```\s*dnd([a-z0-9]*)-spell\s*$/i);
			if (!blockMatch) return null;
			this.currentUrlKey = (blockMatch[1] ?? '').toLowerCase();

			const prefixMatch = /([A-Za-z][A-Za-z\-\s']*)$/.exec(line.slice(0, cursor.ch));
			const query = prefixMatch ? prefixMatch[1].trim() : '';
			if (!query) return null;

			return {
				start: { line: cursor.line, ch: cursor.ch - query.length },
				end: cursor,
				query,
			};
		} catch {
			return null;
		}
	}

	getSuggestions(context: EditorSuggestContext): Array<{ text: string }> {
		const names = getKnownSpellIdsForKey(this.currentUrlKey).map(displayNameFromSlug);
		return getTextSuggestions(names, context.query);
	}
}
