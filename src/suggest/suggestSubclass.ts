import { EditorSuggest, Editor, EditorPosition, TFile } from 'obsidian';
import { getCachedClassNames } from '../dataService';
import { getKnownSubclassNamesForClass, preloadSubclassIds } from '../classes/subclassUtils';
import { nameToSlug } from '../utils';

export class SubclassNameSuggest extends EditorSuggest<{ text: string }> {
  private currentKey: string | null = null;
  private currentUrlKey: string = '';
  private currentBaseUrl: string = '';

  constructor(appPlugin: { app: import('obsidian').App }, private getBaseUrlForKey: (urlKey: string) => string) {
    super(appPlugin.app);
  }

  private detectSubclassBlock(cursor: EditorPosition, editor: Editor): boolean {
    for (let i = cursor.line; i >= Math.max(0, cursor.line - 50); i--) {
      const l = editor.getLine(i).trim();
      if (l.startsWith('```')) {
        const m = /^(?:```\s*dnd([a-z0-9]*)-subclass\s*)$/i.exec(l);
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

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null) {
    try {
      const line = editor.getLine(cursor.line);
      if (line.trim().startsWith('```')) return null;
      if (!this.detectSubclassBlock(cursor, editor)) return null;
      this.currentBaseUrl = this.getBaseUrlForKey(this.currentUrlKey);

      const uptoCursor = line.slice(0, cursor.ch);
      const colonIdx = uptoCursor.indexOf(':');
      if (colonIdx === -1) {
        this.currentKey = null;
        return { start: { line: cursor.line, ch: 0 }, end: { line: cursor.line, ch: cursor.ch }, query: uptoCursor.trim() } as unknown as { start: EditorPosition; end: EditorPosition; query: string };
      }
      this.currentKey = uptoCursor.slice(0, colonIdx).trim().toLowerCase();
      let startCh = colonIdx + 1;
      while (startCh < uptoCursor.length && /\s/.test(uptoCursor[startCh])) startCh++;
      return { start: { line: cursor.line, ch: startCh }, end: { line: cursor.line, ch: cursor.ch }, query: uptoCursor.slice(startCh).trim() } as unknown as { start: EditorPosition; end: EditorPosition; query: string };
    } catch { return null; }
  }

  getSuggestions(context: { query: string; editor: Editor; start: EditorPosition }): Array<{ text: string }> {
    const q = (context.query || '').toLowerCase();

    if (!this.currentKey) {
      return ['class:', 'subclass:'].filter(d => d.startsWith(q) || q.length === 0).map(d => ({ text: d }));
    }

    if (this.currentKey === 'class') {
      return getCachedClassNames().filter(n => n.toLowerCase().includes(q)).slice(0, 50).map(n => ({ text: n }));
    }

    if (this.currentKey === 'subclass') {
      const editor = (context as any).editor as Editor;
      const classSlug = editor ? this.getClassFromBlock((context as any).start, editor) : '';
      if (classSlug && this.currentBaseUrl) {
        // Trigger preload if not yet cached (async, will populate on next keystroke)
        preloadSubclassIds(this.currentUrlKey, this.currentBaseUrl, classSlug);
        return getKnownSubclassNamesForClass(this.currentUrlKey, classSlug)
          .filter(n => n.toLowerCase().includes(q))
          .slice(0, 50)
          .map(n => ({ text: n }));
      }
    }
    return [];
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
