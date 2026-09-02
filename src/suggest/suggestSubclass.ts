import type { App, Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import { getClassNames } from '../data/staticData';
import { getKnownSubclassNamesForParent, preloadSubclassIds } from '../dnd/classes/subclassUtils';
import { getPrimarySlug } from '../utils/text';
import { DndDirectiveSuggest } from './baseSuggest';
import { getTextSuggestions } from './suggestHelpers';

export class SubclassNameSuggest extends DndDirectiveSuggest {
	private currentBaseUrl = '';

	constructor(appPlugin: { app: App }, private readonly getBaseUrlForKey: (urlKey: string) => string) {
		super(appPlugin, /^(?:```\s*dnd([a-z0-9]*)-classinfo\s*)$/i, [], ['class', 'subinfo']);
	}

	onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
		const trigger = super.onTrigger(cursor, editor, file);
		if (trigger) this.currentBaseUrl = this.getBaseUrlForKey(this.currentUrlKey);
		return trigger;
	}

	/** Find the class value already typed in the current block. */
	private getClassFromBlock(cursor: EditorPosition, editor: Editor): string {
		for (let lineNumber = cursor.line; lineNumber >= Math.max(0, cursor.line - 50); lineNumber--) {
			const line = editor.getLine(lineNumber).trim();
			if (line.startsWith('```')) break;
			const match = /^class:\s*(.+)$/i.exec(line);
			if (match) return getPrimarySlug(match[1].trim());
		}
		return '';
	}

	/** Collect subinfo values above the current cursor for nested subclass pages. */
	private getPreviousSubinfosFromBlock(cursor: EditorPosition, editor: Editor): string[] {
		const values: string[] = [];
		for (let lineNumber = cursor.line - 1; lineNumber >= Math.max(0, cursor.line - 50); lineNumber--) {
			const line = editor.getLine(lineNumber).trim();
			if (line.startsWith('```')) break;
			const match = /^subinfo:\s*(.+)$/i.exec(line);
			if (match) {
				const slug = getPrimarySlug(match[1].trim());
				if (slug) values.push(slug);
			}
		}
		values.reverse();
		return values;
	}

	getSuggestions(context: EditorSuggestContext): Array<{ text: string }> {
		const query = context.query || '';

		if (!this.currentKey) {
			const { editor, start } = context;
			const classSlug = this.getClassFromBlock(start, editor);
			const directives = classSlug
				? ['class:', 'subinfo:', 'section:', 'sectionFrom:']
				: ['class:'];
			return getTextSuggestions(directives, query, 'startsWith');
		}

		if (this.currentKey === 'class') {
			return getTextSuggestions(getClassNames(), query);
		}

		if (this.currentKey === 'subinfo') {
			const { editor, start } = context;
			const classSlug = this.getClassFromBlock(start, editor);
			if (classSlug && this.currentBaseUrl) {
				const previousSubinfos = this.getPreviousSubinfosFromBlock(start, editor);
				const parentSubinfo = previousSubinfos.length
					? previousSubinfos[previousSubinfos.length - 1]
					: undefined;
				void preloadSubclassIds(this.currentUrlKey, this.currentBaseUrl, classSlug, parentSubinfo)
					.catch((error: unknown) => {
						console.warn('DnD Wiki: Failed to preload subclass suggestions', error);
					});
				const names = getKnownSubclassNamesForParent(this.currentUrlKey, classSlug, parentSubinfo);
				return getTextSuggestions(names, query);
			}
		}

		return [];
	}
}
