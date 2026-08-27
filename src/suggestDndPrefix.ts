import { EditorSuggest, Editor, EditorPosition, TFile } from 'obsidian';
import { peekBaseUrls } from './dataService';

const BLOCK_SUFFIXES = ['-spell', '-spelllist', '-feat', '-featlist', '-magicitem', '-magicitemlist', '-background', '-backgroundlist', '-lineage', '-lineagelist', '-class', '-classinfo', '-custom'];

export class DndPrefixSuggest extends EditorSuggest<{ text: string }> {
  constructor(appPlugin: { app: import('obsidian').App }) {
    super(appPlugin.app);
  }

  private isAtDndPrefix(cursor: EditorPosition, editor: Editor): { startCh: number; fragment: string } | null {
    const line = editor.getLine(cursor.line);
    const uptoCursor = line.slice(0, cursor.ch);
    // Match: ```dnd followed by optional urlkey fragment and optional suffix fragment
    const re = /```\s*dnd([a-z0-9]*)(-[a-z]*)?$/i;
    const m = re.exec(uptoCursor);
    if (!m) return null;
    const startCh = uptoCursor.search(/dnd/i) + 'dnd'.length;
    const fragment = (m[1] || '') + (m[2] || '');
    return { startCh, fragment };
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null) {
    try {
      const pos = this.isAtDndPrefix(cursor, editor);
      if (!pos) return null;
      const start = { line: cursor.line, ch: pos.startCh };
      const end = { line: cursor.line, ch: cursor.ch };
      return { start, end, query: pos.fragment } as unknown as { start: EditorPosition; end: EditorPosition; query: string };
    } catch {
      return null;
    }
  }

  getSuggestions(context: { query: string }): Array<{ text: string }> {
    const q = (context.query || '').toLowerCase();

    // If query contains a '-', the user has typed a key already — suggest suffixes
    const dashIdx = q.indexOf('-');
    if (dashIdx !== -1) {
      const suffixFragment = q.slice(dashIdx); // includes the '-'
      return BLOCK_SUFFIXES
        .filter((s) => s.toLowerCase().startsWith(suffixFragment))
        .map((s) => ({ text: q.slice(0, dashIdx) + s }))
        .slice(0, 20);
    }

    // Otherwise suggest URL keys from stored config
    const cachedKeys = this._cachedUrlKeys;
    return cachedKeys
      .filter((k) => k.toLowerCase().startsWith(q))
      .map((k) => ({ text: k }))
      .slice(0, 20);
  }

  // Cache of URL keys for sync access in getSuggestions
  private _cachedUrlKeys: string[] = ['5e', '2024'];

  async refreshUrlKeys(): Promise<void> {
    const urls = await peekBaseUrls();
    this._cachedUrlKeys = Object.keys(urls).filter(k => k.trim());
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
