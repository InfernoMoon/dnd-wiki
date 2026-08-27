import { EditorSuggest, Editor, EditorPosition, TFile } from 'obsidian';
import type { EditorSuggestTriggerInfo } from 'obsidian';

export class CustomSuggest extends EditorSuggest<{ text: string }> {
  private hasDirective = false;

  constructor(appPlugin: { app: import('obsidian').App }) {
    super(appPlugin.app);
  }

  private isInCustomBlock(cursor: EditorPosition, editor: Editor): boolean {
    for (let i = cursor.line; i >= Math.max(0, cursor.line - 50); i--) {
      const line = editor.getLine(i).trim();
      if (line.startsWith('```')) return /^```\s*dnd[a-z0-9]*-custom\s*$/i.test(line);
    }
    return false;
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

  renderSuggestion(item: { text: string }, el: HTMLElement): void {
    el.textContent = item.text;
  }

  selectSuggestion(item: { text: string }): void {
    if (!this.context) return;
    const context = this.context as { editor: Editor; start: EditorPosition; end: EditorPosition };
    context.editor.replaceRange(item.text, context.start, context.end);
    context.editor.setCursor({ line: context.end.line, ch: context.start.ch + item.text.length });
    this.close();
  }
}
