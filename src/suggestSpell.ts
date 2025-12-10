import { EditorSuggest, Editor, EditorPosition, TFile } from 'obsidian';
import { displayNameFromSlug } from './utils';

type GetSlugsFn = () => string[];

export class SpellNameSuggest extends EditorSuggest<{ slug: string; display: string }> {
  private readonly getSlugs: GetSlugsFn;

  constructor(appPlugin: any, getSlugs: GetSlugsFn) {
    super(appPlugin.app);
    this.getSlugs = getSlugs;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null) {
    try {
      const line = editor.getLine(cursor.line);
      if (line.trim().startsWith('```')) return null;
      // Detect if inside a ```dnd-spell block by scanning upward
      let inSpellBlock = false;
      for (let i = cursor.line; i >= Math.max(0, cursor.line - 50); i--) {
        const l = editor.getLine(i).trim();
        if (l.startsWith('```')) {
          inSpellBlock = /^```\s*dnd-spell\s*$/i.test(l);
          break;
        }
      }
      if (!inSpellBlock) return null;

      const prefixMatch = /([A-Za-z][A-Za-z\-\s']*)$/.exec(line.slice(0, cursor.ch));
      const query = prefixMatch ? prefixMatch[1].trim() : '';
      if (!query) return null;

      return {
        start: { line: cursor.line, ch: cursor.ch - query.length },
        end: cursor,
        query,
      } as any;
    } catch {
      return null;
    }
  }

  getSuggestions(context: any): Array<{ slug: string; display: string }> {
    const q = (context.query || '').toLowerCase();
    const slugs = this.getSlugs() || [];
    const items = slugs.map(s => ({ slug: s, display: displayNameFromSlug(s) }));
    const results = items.filter(it => it.display.toLowerCase().includes(q)).slice(0, 50);
    return results;
  }

  renderSuggestion(item: { slug: string; display: string }, el: HTMLElement) {
    el.textContent = item.display;
  }

  selectSuggestion(item: { slug: string; display: string }) {
    if (!this.context) return;
    const { editor, start, end } = this.context as any;
    if (!editor) return;
    // Insert the display name into the editor
    editor.replaceRange(item.display, start, end);
    // Move cursor to just after the inserted text
    editor.setCursor({ line: end.line, ch: start.ch + item.display.length });
    this.close();
  }
}
