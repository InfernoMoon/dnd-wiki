import { EditorSuggest, Editor, EditorPosition, TFile } from 'obsidian';

const BLOCK_SUFFIXES = ['-spell', '-spelllist', '-feat', '-featlist'];

export class DndPrefixSuggest extends EditorSuggest<{ text: string }> {
  constructor(appPlugin: { app: import('obsidian').App }) {
    super(appPlugin.app);
  }

  private isAtDndPrefix(cursor: EditorPosition, editor: Editor): { startCh: number } | null {
    const line = editor.getLine(cursor.line);
    const uptoCursor = line.slice(0, cursor.ch);
    // Match starting ```dnd and optionally a partial suffix fragment
    const re = /```\s*dnd(?:-[a-z]+)?$/i;
    const m = re.exec(uptoCursor);
    if (!m) return null;
    const startCh = uptoCursor.lastIndexOf('dnd') + 'dnd'.length;
    return { startCh };
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null) {
    try {
      const pos = this.isAtDndPrefix(cursor, editor);
      if (!pos) return null;
      const line = editor.getLine(cursor.line);
      const uptoCursor = line.slice(0, cursor.ch);
      const reFrag = /```\s*dnd(-[a-z]+)?$/i;
      const fragmentMatch = reFrag.exec(uptoCursor);
      const fragment = (fragmentMatch?.[1] || '').toLowerCase();
      const start = { line: cursor.line, ch: pos.startCh };
      const end = { line: cursor.line, ch: cursor.ch };
      return { start, end, query: fragment } as unknown as { start: EditorPosition; end: EditorPosition; query: string };
    } catch {
      return null;
    }
  }

  getSuggestions(context: { query: string }): Array<{ text: string }> {
    const q = (context.query || '').toLowerCase();
    return BLOCK_SUFFIXES
      .filter((s) => s.toLowerCase().includes(q))
      .map((s) => ({ text: s }))
      .slice(0, 20);
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
