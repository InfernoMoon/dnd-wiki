import { Plugin } from 'obsidian';
import { renderSpell } from './src/spell';
import { renderSpellList } from './src/spellList';
import { renderFeat } from './src/feat';
import { initBaseUrlWatcher, configurePluginId, getBaseUrl, initData } from './src/dataService';
import { preloadAllSpellNames, getKnownSpellIds } from './src/spellUtils';
import { SpellNameSuggest } from './src/suggestSpell';
import { SpellListSuggest } from './src/suggestSpellList';


export default class Dnd5eSpellCards extends Plugin {
	async onload() {
		configurePluginId(this.manifest.id);
		initBaseUrlWatcher(this);
		// Register editor suggestions for ```spell blocks using known spell ids
		this.registerEditorSuggest(new SpellNameSuggest(this, () => getKnownSpellIds()));
		// Register directive suggestions for ```spelllist blocks
		this.registerEditorSuggest(new SpellListSuggest(this));
		this.registerMarkdownCodeBlockProcessor('spell', async (source, el, ctx) => {
			await renderSpell(source, el, ctx);
		});
		// Feat block processor
		this.registerMarkdownCodeBlockProcessor('feat', async (source, el, ctx) => {
			await renderFeat(source, el, ctx);
		});
		// Support multiple aliases for spell list blocks
		const spellListAliases = ['spelllist', 'spellList', 'spell-list'];
		for (const alias of spellListAliases) {
			this.registerMarkdownCodeBlockProcessor(alias, async (source, el, ctx) => {
				await renderSpellList(source, el, ctx);
			});
		}

		// Kick off preload after initialization so Obsidian doesn't wait on it
		this.app.workspace.onLayoutReady(async () => {
			try {
				const baseUrl = await getBaseUrl();
				if (baseUrl) {
					await preloadAllSpellNames(baseUrl);
					await initData();
				}
			} catch (e) {
				console.warn('Failed to preload spell names', e);
			}
		});
	}
}
