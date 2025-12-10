import { EditorSuggest, Editor, EditorPosition, TFile } from 'obsidian';
import { getKnownFeatIds } from './featUtils';
import { displayNameFromSlug } from './utils';

export class FeatNameSuggest extends EditorSuggest<{ text: string }> {
  constructor(appPlugin: { app: import('obsidian').App }) {
    super(appPlugin.app);
  }

  private isInFeatBlock(cursor: EditorPosition, editor: Editor): boolean {
    for (let i = cursor.line; i >= Math.max(0, cursor.line - 50); i--) {
      const l = editor.getLine(i).trim();
      if (l.startsWith('```')) {
        return /^(?:```\s*dnd-feat\s*)$/i.test(l);
      }
    }
    return false;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null) {
    try {
      const line = editor.getLine(cursor.line);
      if (line.trim().startsWith('```')) return null;
      if (!this.isInFeatBlock(cursor, editor)) return null;
      const uptoCursor = line.slice(0, cursor.ch);
      const lastComma = uptoCursor.lastIndexOf(',');
      const startCh = lastComma >= 0 ? lastComma + 1 : 0;
      const query = uptoCursor.slice(startCh).trim().toLowerCase();
      return {
        start: { line: cursor.line, ch: startCh },
        end: { line: cursor.line, ch: cursor.ch },
        query,
      } as unknown as { start: EditorPosition; end: EditorPosition; query: string };
    } catch {
      return null;
    }
  }

  getSuggestions(context: { query: string }): Array<{ text: string }> {
    const q = (context.query || '').toLowerCase();
    const ids = getKnownFeatIds();
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
