import type { Editor, EditorPosition, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import { BaseTextSuggest } from './baseSuggest';
import { findDndCodeBlock } from './suggestHelpers';

export class CustomSuggest extends BaseTextSuggest {
  private hasDirective = false;

  constructor(appPlugin: { app: import('obsidian').App }) {
    super(appPlugin.app);
  }

  private isInCustomBlock(cursor: EditorPosition, editor: Editor): boolean {
    return Boolean(findDndCodeBlock(cursor, editor, /^```\s*dnd[a-z0-9]*-custom\s*$/i));
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    if (line.trim().startsWith('```') || !this.isInCustomBlock(cursor, editor)) return null;

    const uptoCursor = line.slice(0, cursor.ch);
    this.hasDirective = uptoCursor.includes(':');
    if (this.hasDirective) return null;

    return {
      start: { line: cursor.line, ch: 0 },
      end: { line: cursor.line, ch: cursor.ch },
      query: uptoCursor.trim(),
    };
  }

  getSuggestions(context: { query: string }): Array<{ text: string }> {
    if (this.hasDirective) return [];
    const query = (context.query || '').toLowerCase();
    return ['source:', 'section:', 'sectionFrom:']
      .filter((directive) => directive.toLowerCase().startsWith(query) || !query)
      .map((text) => ({ text }));
  }

}
