import { EditorSuggest, Editor, EditorPosition, TFile } from 'obsidian';
import type { EditorSuggestTriggerInfo } from 'obsidian';
import { getKnownLineageIdsForKey } from '../dnd/lineages/lineageUtils';
import { displayNameFromSlug } from '../utils/text';

export class LineageNameSuggest extends EditorSuggest<{ text: string }> {
  private currentUrlKey = '';

  constructor(appPlugin: { app: import('obsidian').App }) {
    super(appPlugin.app);
  }

  private detectLineageBlock(cursor: EditorPosition, editor: Editor): boolean {
    for (let i = cursor.line; i >= Math.max(0, cursor.line - 50); i--) {
      const l = editor.getLine(i).trim();
      if (l.startsWith('```')) {
        const m = /^(?:```\s*dnd([a-z0-9]*)-lineage\s*)$/i.exec(l);
        if (m) { this.currentUrlKey = m[1].toLowerCase(); return true; }
        return false;
      }
    }
    return false;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
    try {
      const line = editor.getLine(cursor.line);
      if (line.trim().startsWith('```')) return null;
      if (!this.detectLineageBlock(cursor, editor)) return null;
      const uptoCursor = line.slice(0, cursor.ch);
      const lastComma = uptoCursor.lastIndexOf(',');
      const startCh = lastComma >= 0 ? lastComma + 1 : 0;
      return { start: { line: cursor.line, ch: startCh }, end: { line: cursor.line, ch: cursor.ch }, query: uptoCursor.slice(startCh).trim().toLowerCase() };
    } catch { return null; }
  }

  getSuggestions(context: { query: string }): Array<{ text: string }> {
    const q = (context.query || '').toLowerCase();
    const ids = getKnownLineageIdsForKey(this.currentUrlKey);
    return ids.map(s => ({ text: displayNameFromSlug(s) })).filter(it => it.text.toLowerCase().includes(q)).slice(0, 50);
  }

  renderSuggestion(item: { text: string }, el: HTMLElement) { el.textContent = item.text; }

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
