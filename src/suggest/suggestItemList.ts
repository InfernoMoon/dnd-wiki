import { EditorSuggest, Editor, EditorPosition, TFile } from 'obsidian';
import type { EditorSuggestTriggerInfo } from 'obsidian';
import { getItemTypeSuggestions } from '../items/itemUtils';

export class ItemListSuggest extends EditorSuggest<{ text: string }> {
  private currentKey: string | null = null;
  private currentUrlKey = '';
  constructor(appPlugin: { app: import('obsidian').App }) {
    super(appPlugin.app);
  }
  // Detect if cursor is inside a dnd[key]-magicitemlist code block; captures the URL key
  private detectItemListBlock(cursor: EditorPosition, editor: Editor): boolean {
    for (let i = cursor.line; i >= Math.max(0, cursor.line - 50); i--) {
      const l = editor.getLine(i).trim();
      if (l.startsWith('```')) {
        const m = /^(?:```\s*dnd([a-z0-9]*)-magicitemlist\s*)$/i.exec(l);
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
      if (!this.detectItemListBlock(cursor, editor)) return null;

      const uptoCursor = line.slice(0, cursor.ch);
      const colonIdx = uptoCursor.indexOf(':');
      if (colonIdx === -1) {
        this.currentKey = null;
        const fragment = uptoCursor.trim();
        return {
          start: { line: cursor.line, ch: 0 },
          end: { line: cursor.line, ch: cursor.ch },
          query: fragment,
        };
      }
      const key = uptoCursor.slice(0, colonIdx).trim().toLowerCase();
      this.currentKey = key;
      let startCh = colonIdx + 1;
      while (startCh < uptoCursor.length && /\s/.test(uptoCursor[startCh])) startCh++;
      if (key === 'type') {
        const uptoValue = uptoCursor.slice(startCh);
        const lastCommaIdx = uptoValue.lastIndexOf(',');
        if (lastCommaIdx !== -1) {
          startCh += lastCommaIdx + 1;
          while (startCh < uptoCursor.length && /\s/.test(uptoCursor[startCh])) startCh++;
        }
      }
      const queryFrag = uptoCursor.slice(startCh).trim();
      return {
        start: { line: cursor.line, ch: startCh },
        end: { line: cursor.line, ch: cursor.ch },
        query: queryFrag,
      };
    } catch {
      return null;
    }
  }

  getSuggestions(context: { query: string }): Array<{ text: string }> {
    const q = (context.query || '').toLowerCase();
    if (!this.currentKey) {
      const directives = ['level:', 'type:', 'attuned:', 'search:', 'searchMode:'];
      return directives
        .filter(d => d.startsWith(q) || q.length === 0)
        .map(d => ({ text: d }));
    }
    if (this.currentKey === 'level') {
      const levels = ['All','Common','Uncommon','Rare','Very-Rare','Legendary','Artifact','Unique','Other'];
      return levels.filter(n => n.toLowerCase().startsWith(q)).map(n => ({ text: n }));
    }
    if (this.currentKey === 'type') {
      return getItemTypeSuggestions()
        .filter(t => t.toLowerCase().includes(q))
        .slice(0, 50)
        .map(t => ({ text: t }));
    }
    if (this.currentKey === 'searchmode') {
      return ['Or', 'And'].filter(o => o.toLowerCase().startsWith(q)).map(o => ({ text: o }));
    }
    if (this.currentKey === 'attuned') {
      const opts = ['All', 'Required', 'Not-Required'];
      return opts.filter(o => o.toLowerCase().startsWith(q)).map(o => ({ text: o }));
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
    editor.setCursor({ line: end.line, ch: start.ch + item.text.length });
    this.close();
  }
}
