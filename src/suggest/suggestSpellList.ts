import { EditorSuggest, Editor, EditorPosition, TFile } from 'obsidian';
import type { EditorSuggestTriggerInfo } from 'obsidian';
import { getCachedClassNames, getCachedSchoolNames } from '../dataService';
import { getKnownSpellIdsForKey } from '../spells/spellUtils';
import { displayNameFromSlug } from '../utils';

export class SpellListSuggest extends EditorSuggest<{ text: string }> {
  private currentKey: string | null = null;
  private currentUrlKey = '';
  constructor(appPlugin: { app: import('obsidian').App }) {
    super(appPlugin.app);
  }
  // Detect if cursor is inside a dnd[key]-spelllist code block; captures the URL key
  private detectSpellListBlock(cursor: EditorPosition, editor: Editor): boolean {
    for (let i = cursor.line; i >= Math.max(0, cursor.line - 50); i--) {
      const l = editor.getLine(i).trim();
      if (l.startsWith('```')) {
        const m = /^(?:```\s*dnd([a-z0-9]*)-spelllist\s*)$/i.exec(l);
        if (m) {
          this.currentUrlKey = m[1].toLowerCase();
          return true;
        }
        return false;
      }
    }
    return false;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    try {
      const line = editor.getLine(cursor.line);
      if (line.trim().startsWith('```')) return null;
      if (!this.detectSpellListBlock(cursor, editor)) return null;

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
        };
      }
      // If we have a directive key, capture it and compute value fragment
      const key = uptoCursor.slice(0, colonIdx).trim().toLowerCase();
      this.currentKey = key;
      let startCh = colonIdx + 1;
      while (startCh < uptoCursor.length && /\s/.test(uptoCursor[startCh])) startCh++;
      // For class/school/addspells/removespell, operate on last fragment after comma
      if (key === 'class' || key === 'school' || key === 'addspells' || key === 'removespells') {
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
      const directives = ['level:', 'class:', 'school:', 'addspells:', 'removespells:', 'search:', 'searchMode:'];
      return directives
        .filter(d => d.startsWith(q) || q.length === 0)
        .map(d => ({ text: d }));
    }
    if (this.currentKey === 'level') {
      const levels = ['all','0','1','2','3','4','5','6','7','8','9'];
      return levels.filter(n => n.startsWith(q)).map(n => ({ text: n }));
    }
    if (this.currentKey === 'class') {
      const options = getCachedClassNames();
      return options.filter(n => n.toLowerCase().includes(q)).slice(0, 50).map(n => ({ text: n }));
    }
    if (this.currentKey === 'school') {
      const options = getCachedSchoolNames();
      return options.filter(n => n.toLowerCase().includes(q)).slice(0, 50).map(n => ({ text: n }));
    }
    if (this.currentKey === 'searchmode') {
      return ['Or', 'And'].filter(o => o.toLowerCase().startsWith(q)).map(o => ({ text: o }));
    }
    if (this.currentKey === 'addspells' || this.currentKey === 'removespells') {
      try {
        const ids: string[] = getKnownSpellIdsForKey(this.currentUrlKey);
        const items = ids.map((s) => ({ text: displayNameFromSlug(s) }));
        return items.filter(it => it.text.toLowerCase().includes(q)).slice(0, 50);
      } catch {
        return [];
      }
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
