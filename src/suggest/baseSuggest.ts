import { EditorSuggest } from 'obsidian';
import type { App, Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import { displayNameFromSlug } from '../utils/text';
import { findDndCodeBlock, getCommaSeparatedStart, getTextSuggestions, TextSuggestion } from './suggestHelpers';

/** Shared rendering and editor replacement behavior for text suggestions. */
export abstract class BaseTextSuggest<T extends TextSuggestion = TextSuggestion> extends EditorSuggest<T> {
	constructor(app: App) {
		super(app);
	}

	renderSuggestion(item: T, el: HTMLElement): void {
		el.textContent = item.text;
	}

	selectSuggestion(item: T): void {
		const context = this.context;
		if (!context) return;

		const { editor, start, end } = context;
		editor.replaceRange(item.text, start, end);
		editor.setCursor({ line: end.line, ch: start.ch + item.text.length });
		this.close();
	}
}

export interface NameSuggestConfig {
	blockPattern: RegExp;
	getIds: (urlKey: string) => string[];
}

/** Shared suggester for comma-separated names backed by an ID cache. */
export class DndNameSuggest extends BaseTextSuggest {
	private currentUrlKey = '';

	constructor(appPlugin: { app: App }, private readonly config: NameSuggestConfig) {
		super(appPlugin.app);
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		try {
			const line = editor.getLine(cursor.line);
			if (line.trim().startsWith('```')) return null;

			const blockMatch = findDndCodeBlock(cursor, editor, this.config.blockPattern);
			if (!blockMatch) return null;
			this.currentUrlKey = (blockMatch[1] ?? '').toLowerCase();

			const startCh = getCommaSeparatedStart(line, cursor);
			return {
				start: { line: cursor.line, ch: startCh },
				end: cursor,
				query: line.slice(startCh, cursor.ch).trim().toLowerCase(),
			};
		} catch {
			return null;
		}
	}

	getSuggestions(context: EditorSuggestContext): TextSuggestion[] {
		const names = this.config.getIds(this.currentUrlKey).map(displayNameFromSlug);
		return getTextSuggestions(names, context.query);
	}
}

/** Shared trigger behavior for D&D blocks that use `key: value` directives. */
export abstract class DndDirectiveSuggest extends BaseTextSuggest {
	protected currentKey: string | null = null;
	protected currentUrlKey = '';

	constructor(
		appPlugin: { app: App },
		private readonly blockPattern: RegExp,
		private readonly commaSeparatedKeys: readonly string[] = [],
	) {
		super(appPlugin.app);
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		try {
			const line = editor.getLine(cursor.line);
			if (line.trim().startsWith('```')) return null;

			const blockMatch = findDndCodeBlock(cursor, editor, this.blockPattern);
			if (!blockMatch) return null;
			this.currentUrlKey = (blockMatch[1] ?? '').toLowerCase();

			const uptoCursor = line.slice(0, cursor.ch);
			const colonIndex = uptoCursor.indexOf(':');
			if (colonIndex === -1) {
				this.currentKey = null;
				return {
					start: { line: cursor.line, ch: 0 },
					end: cursor,
					query: uptoCursor.trim(),
				};
			}

			this.currentKey = uptoCursor.slice(0, colonIndex).trim().toLowerCase();
			let startCh = colonIndex + 1;
			while (startCh < uptoCursor.length && /\s/.test(uptoCursor[startCh])) startCh++;
			if (this.commaSeparatedKeys.includes(this.currentKey)) {
				startCh = getCommaSeparatedStart(line, cursor, startCh);
			}

			return {
				start: { line: cursor.line, ch: startCh },
				end: cursor,
				query: line.slice(startCh, cursor.ch).trim(),
			};
		} catch {
			return null;
		}
	}
}

/** Shared directive suggester for simple list blocks. */
export class SearchListSuggest extends DndDirectiveSuggest {
	getSuggestions(context: EditorSuggestContext): TextSuggestion[] {
		const query = context.query || '';
		if (this.currentKey === 'searchmode') {
			return getTextSuggestions(['Or', 'And'], query, 'startsWith');
		}
		return getTextSuggestions(['search:', 'searchMode:'], query, 'startsWith');
	}
}
