import { EditorSuggest, Editor, EditorPosition, TFile } from 'obsidian';

export class FeatListSuggest extends EditorSuggest<{ text: string }> {
  constructor(appPlugin: { app: import('obsidian').App }) {
    super(appPlugin.app);
  }

  private isInFeatListBlock(cursor: EditorPosition, editor: Editor): boolean {
    for (let i = cursor.line; i >= Math.max(0, cursor.line - 50); i--) {
      const l = editor.getLine(i).trim();
      if (l.startsWith('```')) {
        return /^(?:```\s*dnd[a-z0-9]*-featlist\s*)$/i.test(l);
      }
    }
    return false;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null) {
    try {
      const line = editor.getLine(cursor.line);
      if (line.trim().startsWith('```')) return null;
      if (!this.isInFeatListBlock(cursor, editor)) return null;
      const fragment = line.slice(0, cursor.ch).trim();
      return {
        start: { line: cursor.line, ch: 0 },
        end: { line: cursor.line, ch: cursor.ch },
        query: fragment,
      } as unknown as { start: EditorPosition; end: EditorPosition; query: string };
    } catch {
      return null;
    }
  }

  getSuggestions(context: { query: string }): Array<{ text: string }> {
    const q = (context.query || '').toLowerCase();
    const directives = ['search:'];
    return directives.filter(d => d.startsWith(q) || q.length === 0).map(d => ({ text: d }));
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
