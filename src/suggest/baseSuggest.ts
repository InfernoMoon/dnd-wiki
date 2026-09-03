import { EditorSuggest } from 'obsidian';
import type { App, Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import { displayNameFromSlug } from '../utils/text';
import { findDndCodeBlock, getCommaSeparatedStart, getTextSuggestions, TextSuggestion } from './suggestHelpers';

/** Shared rendering and editor replacement behavior for text suggestions. */
export abstract class BaseTextSuggest<T extends TextSuggestion = TextSuggestion> extends EditorSuggest<T> {
	constructor(app: App) {
		super(app);
	}

	/** Open this suggester at the editor cursor when its trigger matches. */
	openAtCursor(editor: Editor, file: TFile): boolean {
		const cursor = editor.getCursor();
		const trigger = this.onTrigger(cursor, editor, file);
		if (!trigger) return false;

		this.context = { ...trigger, editor, file };
		this.open();
		return true;
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

export type AdditionalPropertiesProvider = (context: EditorSuggestContext) => readonly string[];

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
		private readonly autoOpenKeys: readonly string[] = [],
		private readonly additionalPropertiesProvider?: AdditionalPropertiesProvider,
	) {
		super(appPlugin.app);
	}

	/** Suggest the base properties plus any properties valid for the current block. */
	protected getDirectiveSuggestions(
		context: EditorSuggestContext,
		properties: readonly string[],
	): TextSuggestion[] {
		const additionalProperties = this.additionalPropertiesProvider?.(context) ?? [];
		return getTextSuggestions(
			[...properties, ...additionalProperties],
			context.query,
			'startsWith',
		);
	}

	/** Return whether selecting this directive should immediately show its values. */
	private shouldOpenValues(item: TextSuggestion): boolean {
		const key = item.text.replace(/:\s*$/, '').toLowerCase();
		return this.autoOpenKeys.includes(key);
	}

	selectSuggestion(item: TextSuggestion): void {
		const context = this.context;
		const expectedCursor = context
			? { line: context.end.line, ch: context.start.ch + item.text.length }
			: null;

		super.selectSuggestion(item);
		if (!context || !expectedCursor || !this.shouldOpenValues(item)) return;

		window.setTimeout(() => {
			const cursor = context.editor.getCursor();
			if (cursor.line !== expectedCursor.line || cursor.ch !== expectedCursor.ch) return;
			this.openAtCursor(context.editor, context.file);
		}, 0);
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
	constructor(appPlugin: { app: App }, blockPattern: RegExp) {
		super(appPlugin, blockPattern, [], ['searchmode']);
	}

	getSuggestions(context: EditorSuggestContext): TextSuggestion[] {
		const query = context.query || '';
		if (this.currentKey === 'searchmode') {
			return getTextSuggestions(['Or', 'And'], query, 'startsWith');
		}
		return getTextSuggestions(['search:', 'searchMode:'], query, 'startsWith');
	}
}
