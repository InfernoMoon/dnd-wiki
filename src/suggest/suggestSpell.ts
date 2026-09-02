import { EditorSuggest, Editor, EditorPosition, TFile } from 'obsidian';
import type { App, EditorSuggestContext, EditorSuggestTriggerInfo } from 'obsidian';
import { displayNameFromSlug } from '../utils/text';
import { getKnownSpellIdsForKey } from '../dnd/spells/spellUtils';

export class SpellNameSuggest extends EditorSuggest<{ slug: string; display: string }> {
  private currentUrlKey = '';

  constructor(appPlugin: { app: App }) {
    super(appPlugin.app);
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    try {
      const line = editor.getLine(cursor.line);
      if (line.trim().startsWith('```')) return null;
      // Detect if inside a ```dnd[key]-spell block by scanning upward; capture the URL key
      let foundBlock = false;
      for (let i = cursor.line; i >= Math.max(0, cursor.line - 50); i--) {
        const l = editor.getLine(i).trim();
        if (l.startsWith('```')) {
          const m = /^```\s*dnd([a-z0-9]*)-spell\s*$/i.exec(l);
          if (m) {
            this.currentUrlKey = m[1].toLowerCase();
            foundBlock = true;
          }
          break;
        }
      }
      if (!foundBlock) return null;

      const prefixMatch = /([A-Za-z][A-Za-z\-\s']*)$/.exec(line.slice(0, cursor.ch));
      const query = prefixMatch ? prefixMatch[1].trim() : '';
      if (!query) return null;

      return {
        start: { line: cursor.line, ch: cursor.ch - query.length },
        end: cursor,
        query,
      };
    } catch {
      return null;
    }
  }

  getSuggestions(context: EditorSuggestContext): Array<{ slug: string; display: string }> {
    const q = (context.query || '').toLowerCase();
    // Use per-key spell list if a specific URL key was detected in onTrigger
    const slugs = getKnownSpellIdsForKey(this.currentUrlKey);
    const items = slugs.map((s) => ({ slug: s, display: displayNameFromSlug(s) }));
    return items.filter((it: { display: string }) => it.display.toLowerCase().includes(q)).slice(0, 50);
  }

  renderSuggestion(item: { slug: string; display: string }, el: HTMLElement) {
    el.textContent = item.display;
  }

  selectSuggestion(item: { slug: string; display: string }) {
    if (!this.context) return;
    const { editor, start, end } = this.context;
    editor.replaceRange(item.display, start, end);
    editor.setCursor({ line: end.line, ch: start.ch + item.display.length });
    this.close();
  }
}
