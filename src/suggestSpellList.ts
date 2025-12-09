import { EditorSuggest, Editor, EditorPosition, TFile } from 'obsidian';

export class SpellListSuggest extends EditorSuggest<{ text: string }> {
  private currentKey: string | null = null;
  // Accept plugin with `app` property; type as unknown to avoid `any`
  constructor(appPlugin: { app: import('obsidian').App }) {
    super(appPlugin.app);
  }
  // Detect if cursor is inside a ```spelllist code block
  private isInSpellListBlock(cursor: EditorPosition, editor: Editor): boolean {
    for (let i = cursor.line; i >= Math.max(0, cursor.line - 50); i--) {
      const l = editor.getLine(i).trim();
      if (l.startsWith('```')) {
        return /^```\s*spelllist\s*$/i.test(l);
      }
    }
    return false;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null) {
    try {
      const line = editor.getLine(cursor.line);
      if (line.trim().startsWith('```')) return null;
      if (!this.isInSpellListBlock(cursor, editor)) return null;

      const uptoCursor = line.slice(0, cursor.ch);
      const colonIdx = uptoCursor.indexOf(':');
      // When no colon present, suggest directive keywords
      if (colonIdx === -1) {
        this.currentKey = null;
        const fragment = uptoCursor.trim();
        return {
          start: { line: cursor.line, ch: 0 },
          end: { line: cursor.line, ch: cursor.ch },
          query: fragment,
        } as unknown as { start: EditorPosition; end: EditorPosition; query: string };
      }
      // If we have `level:`, suggest level values
      const key = uptoCursor.slice(0, colonIdx).trim().toLowerCase();
      this.currentKey = key;
      const afterColon = uptoCursor.slice(colonIdx + 1);
      const valueFragment = afterColon.trim();
      if (key === 'level') {
        // Start position right after colon and any spaces
        let startCh = colonIdx + 1;
        while (startCh < uptoCursor.length && /\s/.test(uptoCursor[startCh])) startCh++;
        return {
          start: { line: cursor.line, ch: startCh },
          end: { line: cursor.line, ch: cursor.ch },
          query: valueFragment,
        } as unknown as { start: EditorPosition; end: EditorPosition; query: string };
      }
      return null;
    } catch {
      return null;
    }
  }

  getSuggestions(context: { query: string }): Array<{ text: string }> {
    const q = (context.query || '').toLowerCase();
    // If querying for directive keyword (no colon typed yet), suggest with colon suffix
    if (!this.currentKey) {
      const directives = ['level:', 'class:', 'school:'];
      return directives
        .filter(d => d.startsWith(q) || q.length === 0)
        .map(d => ({ text: d }));
    }
    // Value suggestion mode for `level:`
    if (this.currentKey === 'level') {
      const levels = ['all','0','1','2','3','4','5','6','7','8','9'];
      return levels.filter(n => n.startsWith(q)).map(n => ({ text: n }));
    }
    return [];
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
    this.close();
  }
}
