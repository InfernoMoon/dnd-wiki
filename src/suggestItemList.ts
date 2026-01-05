import { EditorSuggest, Editor, EditorPosition, TFile } from 'obsidian';
import { getCachedItemTypes } from './itemUtils';

// Hardcoded type options for itemlist filtering
const HARD_CODED_TYPES = [
  'Armor',
  'Potion',
  'Ring',
  'Rod',
  'Scroll',
  'Staff',
  'Wand',
  'Weapon',
  'Wondrous Item',
];

export class ItemListSuggest extends EditorSuggest<{ text: string }> {
  private currentKey: string | null = null;
  constructor(appPlugin: { app: import('obsidian').App }) {
    super(appPlugin.app);
  }
  // Detect if cursor is inside a dnd-itemlist code block
  private isInItemListBlock(cursor: EditorPosition, editor: Editor): boolean {
    for (let i = cursor.line; i >= Math.max(0, cursor.line - 50); i--) {
      const l = editor.getLine(i).trim();
      if (l.startsWith('```')) {
        return /^(?:```\s*dnd-itemlist\s*)$/i.test(l);
      }
    }
    return false;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null) {
    try {
      const line = editor.getLine(cursor.line);
      if (line.trim().startsWith('```')) return null;
      if (!this.isInItemListBlock(cursor, editor)) return null;

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
      // If we have a directive key, capture it and compute value fragment
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
      } as unknown as { start: EditorPosition; end: EditorPosition; query: string };
    } catch {
      return null;
    }
  }

  getSuggestions(context: { query: string }): Array<{ text: string }> {
    const q = (context.query || '').toLowerCase();
    // If querying for directive keyword (no colon typed yet), suggest with colon suffix
    if (!this.currentKey) {
      const directives = ['level:', 'type:', 'attuned:'];
      return directives
        .filter(d => d.startsWith(q) || q.length === 0)
        .map(d => ({ text: d }));
    }
    if (this.currentKey === 'level') {
      const levels = ['All','Common','Uncommon','Rare','Very-Rare','Legendary','Artifact','Unique','Other'];
      return levels.filter(n => n.toLowerCase().startsWith(q)).map(n => ({ text: n }));
    }
    if (this.currentKey === 'type') {
      const dynamicTypes = getCachedItemTypes();
      const allTypes = Array.from(new Set([...HARD_CODED_TYPES, ...dynamicTypes]));
      return allTypes
        .filter(t => t.toLowerCase().includes(q))
        .slice(0, 50)
        .map(t => ({ text: t }));
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
