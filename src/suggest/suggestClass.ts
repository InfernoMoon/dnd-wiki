import type { App, Editor, EditorPosition, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import { getClassNames } from '../data/staticData';
import { BaseTextSuggest } from './baseSuggest';
import { findDndCodeBlock, getTextSuggestions } from './suggestHelpers';

export class ClassNameSuggest extends BaseTextSuggest {
	private classNames: string[] = [];

	constructor(appPlugin: { app: App }) {
		super(appPlugin.app);
	}

	async refreshClassNames(): Promise<void> {
		this.classNames = getClassNames();
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		try {
			const line = editor.getLine(cursor.line);
			if (line.trim().startsWith('```')) return null;
			if (!findDndCodeBlock(cursor, editor, /^(?:```\s*dnd[a-z0-9]*-class\s*)$/i)) return null;

			const query = line.slice(0, cursor.ch).trim().toLowerCase();
			return {
				start: { line: cursor.line, ch: 0 },
				end: cursor,
				query,
			};
		} catch {
			return null;
		}
	}

	getSuggestions(context: { query: string }): Array<{ text: string }> {
		return getTextSuggestions(this.classNames, context.query);
	}
}
