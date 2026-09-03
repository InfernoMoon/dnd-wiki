import type { Editor, EditorPosition, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import { peekBaseUrls } from './settings/settingsService';
import { BaseTextSuggest } from './suggest/baseSuggest';

const BLOCK_SUFFIXES = ['-spell', '-spelllist', '-feat', '-featlist', '-magicitem', '-magicitemlist', '-equipment', '-equipmentlist', '-weapon', '-weaponlist', '-background', '-backgroundlist', '-lineage', '-lineagelist', '-class', '-classinfo', '-custom'];

export class DndPrefixSuggest extends BaseTextSuggest {
	private autoSuggestSuffixFor = '';

  constructor(appPlugin: { app: import('obsidian').App }) {
    super(appPlugin.app);
  }

	selectSuggestion(item: { text: string }): void {
		const context = this.context;
		const expectedCursor = context
			? { line: context.end.line, ch: context.start.ch + item.text.length }
			: null;
		const selectedUrlKey = this._cachedUrlKeys.some((key) => key.toLowerCase() === item.text.toLowerCase());

		super.selectSuggestion(item);
		if (!context || !expectedCursor || !selectedUrlKey) return;

		this.autoSuggestSuffixFor = item.text.toLowerCase();
		window.setTimeout(() => {
			const cursor = context.editor.getCursor();
			if (cursor.line !== expectedCursor.line || cursor.ch !== expectedCursor.ch) return;
			this.openAtCursor(context.editor, context.file);
		}, 0);
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

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
    try {
      const pos = this.isAtDndPrefix(cursor, editor);
      if (!pos) return null;
      const start = { line: cursor.line, ch: pos.startCh };
      const end = { line: cursor.line, ch: cursor.ch };
      return { start, end, query: pos.fragment };
    } catch {
      return null;
    }
  }

  getSuggestions(context: { query: string }): Array<{ text: string }> {
    const q = (context.query || '').toLowerCase();

		if (this.autoSuggestSuffixFor === q && q) {
			return BLOCK_SUFFIXES.map((suffix) => ({ text: q + suffix }));
		}
		this.autoSuggestSuffixFor = '';

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
  private _cachedUrlKeys: string[] = [];

  async refreshUrlKeys(): Promise<void> {
    const urls = await peekBaseUrls();
    this._cachedUrlKeys = Object.keys(urls).filter(k => k.trim());
  }

}
