import { EditorSuggest, Editor, EditorPosition, TFile } from 'obsidian';
import type { EditorSuggestTriggerInfo } from 'obsidian';

export class LineageListSuggest extends EditorSuggest<{ text: string }> {
  private currentKey: string | null = null;

  constructor(appPlugin: { app: import('obsidian').App }) {
    super(appPlugin.app);
  }

  private isInLineageListBlock(cursor: EditorPosition, editor: Editor): boolean {
    for (let i = cursor.line; i >= Math.max(0, cursor.line - 50); i--) {
      const l = editor.getLine(i).trim();
      if (l.startsWith('```')) return /^(?:```\s*dnd[a-z0-9]*-lineagelist\s*)$/i.test(l);
    }
    return false;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
    try {
      const line = editor.getLine(cursor.line);
      if (line.trim().startsWith('```')) return null;
      if (!this.isInLineageListBlock(cursor, editor)) return null;
      const uptoCursor = line.slice(0, cursor.ch);
      const colonIdx = uptoCursor.indexOf(':');
      if (colonIdx === -1) {
        this.currentKey = null;
        return { start: { line: cursor.line, ch: 0 }, end: { line: cursor.line, ch: cursor.ch }, query: uptoCursor.trim() };
      }
      this.currentKey = uptoCursor.slice(0, colonIdx).trim().toLowerCase();
      let startCh = colonIdx + 1;
      while (startCh < uptoCursor.length && /\s/.test(uptoCursor[startCh])) startCh++;
      return { start: { line: cursor.line, ch: startCh }, end: { line: cursor.line, ch: cursor.ch }, query: uptoCursor.slice(startCh).trim() };
    } catch { return null; }
  }

  getSuggestions(context: { query: string }): Array<{ text: string }> {
    const q = (context.query || '').toLowerCase();
    if (this.currentKey === 'searchmode') {
      return ['Or', 'And'].filter(o => o.toLowerCase().startsWith(q)).map(o => ({ text: o }));
    }
    return ['search:', 'searchMode:'].filter(d => d.startsWith(q) || q.length === 0).map(d => ({ text: d }));
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
