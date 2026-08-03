import { Plugin } from 'obsidian';
import { renderSpell } from './src/spell';
import { renderSpellList } from './src/spellList';
import { renderFeat } from './src/feat';
import { renderItem } from './src/item';
import { initBaseUrlWatcher, configurePluginRef, getBaseUrl, initData } from './src/dataService';
import { preloadAllSpellNames, getKnownSpellIds } from './src/spellUtils';
import { SpellNameSuggest } from './src/suggest/suggestSpell';
import { SpellListSuggest } from './src/suggest/suggestSpellList';
import { FeatNameSuggest } from './src/suggest/suggestFeat';
import { ItemNameSuggest } from './src/suggest/suggestItem';
import { ItemListSuggest } from './src/suggest/suggestItemList';
import { preloadAllFeatIds } from './src/featUtils';
import { preloadAllItemIds } from './src/itemUtils';
import { renderFeatList } from './src/featList';
import { renderItemList } from './src/itemList';
import { DndPrefixSuggest } from './src/suggestDndPrefix';
import { DndCardsSettingTab } from './src/settings';


export default class Dnd5eSpellCards extends Plugin {
	async onload() {
		configurePluginRef(this);
		initBaseUrlWatcher(this);
		// Register editor suggestions for ```spell blocks using known spell ids
		this.registerEditorSuggest(new SpellNameSuggest(this, () => getKnownSpellIds()));
		// Register editor suggestions for ```feat blocks using known feat ids
		this.registerEditorSuggest(new FeatNameSuggest(this));
		// Register directive suggestions for ```spelllist blocks
		this.registerEditorSuggest(new SpellListSuggest(this));
		// Register directive suggestions for ```dnd-itemlist blocks
		this.registerEditorSuggest(new ItemListSuggest(this));
		// Register suggestions when typing ```dnd for block suffixes
		const dndPrefixSuggest = new DndPrefixSuggest(this);
		dndPrefixSuggest.refreshUrlKeys();
		this.registerEditorSuggest(dndPrefixSuggest);
		// Register editor suggestions for ```dnd-item blocks
		this.registerEditorSuggest(new ItemNameSuggest(this));
		this.registerMarkdownCodeBlockProcessor('dnd-spell', async (source, el, ctx) => {
			await renderSpell(source, el, ctx);
		});
		// Feat block processor
		this.registerMarkdownCodeBlockProcessor('dnd-feat', async (source, el, ctx) => {
			await renderFeat(source, el, ctx);
		});

		// Item block processor
		this.registerMarkdownCodeBlockProcessor('dnd-item', async (source, el, ctx) => {
			await renderItem(source, el, ctx);
		});

		// Feat list block processor (no filters)
		this.registerMarkdownCodeBlockProcessor('dnd-featlist', async (source, el, ctx) => {
			await renderFeatList(source, el, ctx);
		});
		// Register only the canonical spelllist block
		this.registerMarkdownCodeBlockProcessor('dnd-spelllist', async (source, el, ctx) => {
			await renderSpellList(source, el, ctx);
		});

		// Wondrous items list processor
		this.registerMarkdownCodeBlockProcessor('dnd-itemlist', async (source, el, ctx) => {
			await renderItemList(source, el, ctx);
		});

		// Kick off preload after initialization so Obsidian doesn't wait on it
		this.app.workspace.onLayoutReady(async () => {
			try {
				const baseUrl = await getBaseUrl();
				if (baseUrl) {
					await preloadAllSpellNames(baseUrl);
					await preloadAllFeatIds(baseUrl);
					await preloadAllItemIds(baseUrl);
					await initData();
				}
			} catch (e) {
				console.warn('Failed to preload spell names', e);
			}
		});

		// Add settings tab to show and edit Base URL
		this.addSettingTab(new DndCardsSettingTab(this.app, this));
	}
}
