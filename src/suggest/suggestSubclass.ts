import { EditorSuggest, Editor, EditorPosition, TFile } from 'obsidian';
import type { App, EditorSuggestContext, EditorSuggestTriggerInfo } from 'obsidian';
import { getCachedClassNames } from '../dataService';
import { getKnownSubclassNamesForParent, preloadSubclassIds } from '../dnd/classes/subclassUtils';
import { nameToSlug } from '../utils/text';

export class SubclassNameSuggest extends EditorSuggest<{ text: string }> {
  private currentKey: string | null = null;
  private currentUrlKey = '';
  private currentBaseUrl = '';

  constructor(appPlugin: { app: App }, private getBaseUrlForKey: (urlKey: string) => string) {
    super(appPlugin.app);
  }

  private detectSubclassBlock(cursor: EditorPosition, editor: Editor): boolean {
    for (let i = cursor.line; i >= Math.max(0, cursor.line - 50); i--) {
      const l = editor.getLine(i).trim();
      if (l.startsWith('```')) {
        const m = /^(?:```\s*dnd([a-z0-9]*)-classinfo\s*)$/i.exec(l);
        if (m) { this.currentUrlKey = m[1].toLowerCase(); return true; }
        return false;
      }
    }
    return false;
  }

  /** Find the class: value already typed in the current block */
  private getClassFromBlock(cursor: EditorPosition, editor: Editor): string {
    for (let i = cursor.line; i >= Math.max(0, cursor.line - 50); i--) {
      const l = editor.getLine(i).trim();
      if (l.startsWith('```')) break;
      const m = /^class:\s*(.+)$/i.exec(l);
      if (m) return nameToSlug(m[1].trim());
    }
    return '';
  }

  /**
   * Collect previously written subinfo values above the current cursor line.
   * Used to recursively suggest from the most recent subinfo page.
   */
  private getPreviousSubinfosFromBlock(cursor: EditorPosition, editor: Editor): string[] {
    const values: string[] = [];
    for (let i = cursor.line - 1; i >= Math.max(0, cursor.line - 50); i--) {
      const l = editor.getLine(i).trim();
      if (l.startsWith('```')) break;
      const m = /^subinfo:\s*(.+)$/i.exec(l);
      if (m) {
        const slug = nameToSlug(m[1].trim());
        if (slug) values.push(slug);
      }
    }
    values.reverse();
    return values;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
    try {
      const line = editor.getLine(cursor.line);
      if (line.trim().startsWith('```')) return null;
      if (!this.detectSubclassBlock(cursor, editor)) return null;
      this.currentBaseUrl = this.getBaseUrlForKey(this.currentUrlKey);

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

  getSuggestions(context: EditorSuggestContext): Array<{ text: string }> {
    const q = (context.query || '').toLowerCase();

    if (!this.currentKey) {
      const { editor, start } = context;
        const classSlug = this.getClassFromBlock(start, editor);
      const directives = classSlug
        ? ['class:', 'subinfo:', 'section:', 'sectionFrom:']
        : ['class:'];
      return directives
        .filter(d => d.toLowerCase().startsWith(q) || q.length === 0)
        .map(d => ({ text: d }));
    }

    if (this.currentKey === 'class') {
      return getCachedClassNames().filter(n => n.toLowerCase().includes(q)).slice(0, 50).map(n => ({ text: n }));
    }

    if (this.currentKey === 'subinfo') {
      const { editor, start } = context;
      const classSlug = this.getClassFromBlock(start, editor);
      if (classSlug && this.currentBaseUrl) {
        const prevSubinfos = this.getPreviousSubinfosFromBlock(start, editor);
        const parentSubinfo = prevSubinfos.length ? prevSubinfos[prevSubinfos.length - 1] : undefined;
        // Trigger preload if not yet cached (async, will populate on next keystroke)
        void preloadSubclassIds(this.currentUrlKey, this.currentBaseUrl, classSlug, parentSubinfo)
          .catch((error) => {
            console.warn('DnD Wiki: Failed to preload subclass suggestions', error);
          });
        return getKnownSubclassNamesForParent(this.currentUrlKey, classSlug, parentSubinfo)
          .filter(n => n.toLowerCase().includes(q))
          .slice(0, 50)
          .map(n => ({ text: n }));
      }
    }

    if (this.currentKey === 'section' || this.currentKey === 'sectionfrom') {
      return [];
    }
    return [];
  }

  renderSuggestion(item: { text: string }, el: HTMLElement) { el.textContent = item.text; }

  selectSuggestion(item: { text: string }) {
    if (!this.context) return;
    const { editor, start, end } = this.context;
    editor.replaceRange(item.text, start, end);
    editor.setCursor({ line: end.line, ch: start.ch + item.text.length });
    this.close();
  }
}
