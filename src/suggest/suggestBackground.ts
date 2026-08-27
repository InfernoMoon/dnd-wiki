import { EditorSuggest, Editor, EditorPosition, TFile } from 'obsidian';
import type { EditorSuggestTriggerInfo } from 'obsidian';
import { getKnownBackgroundIdsForKey } from '../backgrounds/backgroundUtils';
import { displayNameFromSlug } from '../utils';

export class BackgroundNameSuggest extends EditorSuggest<{ text: string }> {
  private currentUrlKey = '';

  constructor(appPlugin: { app: import('obsidian').App }) {
    super(appPlugin.app);
  }

  private detectBackgroundBlock(cursor: EditorPosition, editor: Editor): boolean {
    for (let i = cursor.line; i >= Math.max(0, cursor.line - 50); i--) {
      const l = editor.getLine(i).trim();
      if (l.startsWith('```')) {
        const m = /^(?:```\s*dnd([a-z0-9]*)-background\s*)$/i.exec(l);
        if (m) {
          this.currentUrlKey = m[1].toLowerCase();
          return true;
        }
        return false;
      }
    }
    return false;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
    try {
      const line = editor.getLine(cursor.line);
      if (line.trim().startsWith('```')) return null;
      if (!this.detectBackgroundBlock(cursor, editor)) return null;
      const uptoCursor = line.slice(0, cursor.ch);
      const lastComma = uptoCursor.lastIndexOf(',');
      const startCh = lastComma >= 0 ? lastComma + 1 : 0;
      const query = uptoCursor.slice(startCh).trim().toLowerCase();
      return {
        start: { line: cursor.line, ch: startCh },
        end: { line: cursor.line, ch: cursor.ch },
        query,
      };
    } catch {
      return null;
    }
  }

  getSuggestions(context: { query: string }): Array<{ text: string }> {
    const q = (context.query || '').toLowerCase();
    const ids = getKnownBackgroundIdsForKey(this.currentUrlKey);
    const items = ids.map((s) => ({ text: displayNameFromSlug(s) }));
    return items.filter(it => it.text.toLowerCase().includes(q)).slice(0, 50);
  }

  renderSuggestion(item: { text: string }, el: HTMLElement) {
    el.textContent = item.text;
  }

  selectSuggestion(item: { text: string }) {
    if (!this.context) return;
    const ctx = this.context as { editor: Editor; start: EditorPosition; end: EditorPosition } | null;
    if (!ctx) return;
    const { editor, start, end } = ctx;
    if (!editor) return;
    editor.replaceRange(item.text, start, end);
    editor.setCursor({ line: end.line, ch: start.ch + item.text.length });
    this.close();
  }
}
