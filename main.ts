import { Plugin } from 'obsidian';
import { renderSpell } from './src/dnd/spells/spell';
import { renderSpellList } from './src/dnd/spells/spelllist';
import { renderFeat } from './src/dnd/feats/feat';
import { renderItem } from './src/dnd/items/item';
import { initBaseUrlWatcher, configurePluginRef, initData, peekBaseUrls, initializeDefaultUrls } from './src/dataService';
import { preloadAllSpellNames } from './src/dnd/spells/spellUtils';
import { SpellNameSuggest } from './src/suggest/suggestSpell';
import { SpellListSuggest } from './src/suggest/suggestSpellList';
import { FeatNameSuggest } from './src/suggest/suggestFeat';
import { ItemNameSuggest } from './src/suggest/suggestItem';
import { ItemListSuggest } from './src/suggest/suggestItemList';
import { BackgroundNameSuggest } from './src/suggest/suggestBackground';
import { FeatListSuggest } from './src/suggest/suggestFeatList';
import { BackgroundListSuggest } from './src/suggest/suggestBackgroundList';
import { LineageNameSuggest } from './src/suggest/suggestLineage';
import { LineageListSuggest } from './src/suggest/suggestLineageList';
import { ClassNameSuggest } from './src/suggest/suggestClass';
import { SubclassNameSuggest } from './src/suggest/suggestSubclass';
import { preloadAllFeatIds } from './src/dnd/feats/featService';
import { preloadAllItemIds } from './src/dnd/items/itemUtils';
import { preloadAllBackgroundIds } from './src/dnd/backgrounds/backgroundUtils';
import { preloadAllLineageIds } from './src/dnd/lineages/lineageUtils';
import { renderFeatList } from './src/dnd/feats/featList';
import { renderItemList } from './src/dnd/items/itemList';
import { renderBackground } from './src/dnd/backgrounds/background';
import { renderBackgroundList } from './src/dnd/backgrounds/backgroundList';
import { renderLineage } from './src/dnd/lineages/lineage';
import { renderLineageList } from './src/dnd/lineages/lineageList';
import { renderClass } from './src/dnd/classes/class';
import { renderSubclass } from './src/dnd/classes/subclass';
import { DndPrefixSuggest } from './src/suggestDndPrefix';
import { DndCardsSettingTab } from './src/settings';
import { renderCustom } from './src/dnd/custom/custom';
import { CustomSuggest } from './src/suggest/suggestCustom';
import { ensureHomebrewPropertyTypes } from './src/homebrew/homebrew';
import { registerHomebrewFileCommand } from './src/homebrew/homebrewCommand';


export default class DndWiki extends Plugin {
	async onload() {
		configurePluginRef(this);
		initBaseUrlWatcher(this);
		registerHomebrewFileCommand(this.app, (command) => this.addCommand(command));
		void ensureHomebrewPropertyTypes(this.app.vault.adapter).catch((error: unknown) => {
			console.warn('DnD Wiki: Failed to ensure homebrew property types', error);
		});
		// Write default URLs to disk on first install (no-op if already saved)
		await initializeDefaultUrls();
		// Register editor suggestions for ```spell blocks using known spell ids
		this.registerEditorSuggest(new SpellNameSuggest(this));
		// Register editor suggestions for ```feat blocks using known feat ids
		this.registerEditorSuggest(new FeatNameSuggest(this));
		// Register directive suggestions for ```spelllist blocks
		this.registerEditorSuggest(new SpellListSuggest(this));
		// Register directive suggestions for ```dnd-itemlist blocks
		this.registerEditorSuggest(new ItemListSuggest(this));
		// Register suggestions when typing ```dnd for block suffixes
		const dndPrefixSuggest = new DndPrefixSuggest(this);
		await dndPrefixSuggest.refreshUrlKeys();
		this.registerEditorSuggest(dndPrefixSuggest);
		// Register editor suggestions for ```dnd-item blocks
		this.registerEditorSuggest(new ItemNameSuggest(this));
		this.registerEditorSuggest(new BackgroundNameSuggest(this));
		this.registerEditorSuggest(new FeatListSuggest(this));
		this.registerEditorSuggest(new BackgroundListSuggest(this));
		this.registerEditorSuggest(new LineageNameSuggest(this));
		this.registerEditorSuggest(new LineageListSuggest(this));
		const classNameSuggest = new ClassNameSuggest(this);
		await classNameSuggest.refreshClassNames();
		this.registerEditorSuggest(classNameSuggest);
		// Subclass suggester — receives a lookup fn to resolve urlKey -> baseUrl at suggestion time
		const urlsSnapshot = await peekBaseUrls();
		this.registerEditorSuggest(new SubclassNameSuggest(this, (urlKey) => urlsSnapshot[urlKey] || ''));
		this.registerEditorSuggest(new CustomSuggest(this));
		// Block processors — registered dynamically per URL key in onLayoutReady below
		// Feat block processor — register for each configured URL key
		this.app.workspace.onLayoutReady(async () => {
			const urls = await peekBaseUrls();
			for (const [urlKey, baseUrl] of Object.entries(urls)) {
				if (!baseUrl) continue;
				this.registerMarkdownCodeBlockProcessor(`dnd${urlKey}-spell`, async (source, el, ctx) => {
					await renderSpell(source, el, ctx, urlKey, baseUrl);
				});
				this.registerMarkdownCodeBlockProcessor(`dnd${urlKey}-spelllist`, async (source, el, ctx) => {
					await renderSpellList(source, el, ctx, urlKey, baseUrl);
				});
				this.registerMarkdownCodeBlockProcessor(`dnd${urlKey}-feat`, async (source, el, ctx) => {
					await renderFeat(source, el, ctx, urlKey, baseUrl);
				});
				this.registerMarkdownCodeBlockProcessor(`dnd${urlKey}-featlist`, async (source, el, ctx) => {
					await renderFeatList(source, el, ctx, urlKey, baseUrl);
				});
				this.registerMarkdownCodeBlockProcessor(`dnd${urlKey}-magicitem`, async (source, el, ctx) => {
					await renderItem(source, el, ctx, urlKey, baseUrl);
				});
				this.registerMarkdownCodeBlockProcessor(`dnd${urlKey}-magicitemlist`, async (source, el, ctx) => {
					await renderItemList(source, el, ctx, urlKey, baseUrl);
				});
				this.registerMarkdownCodeBlockProcessor(`dnd${urlKey}-background`, async (source, el, ctx) => {
					await renderBackground(source, el, ctx, urlKey, baseUrl);
				});
				this.registerMarkdownCodeBlockProcessor(`dnd${urlKey}-backgroundlist`, async (source, el, ctx) => {
					await renderBackgroundList(source, el, ctx, urlKey, baseUrl);
				});
				this.registerMarkdownCodeBlockProcessor(`dnd${urlKey}-lineage`, async (source, el, ctx) => {
					await renderLineage(source, el, ctx, urlKey, baseUrl);
				});
				this.registerMarkdownCodeBlockProcessor(`dnd${urlKey}-lineagelist`, async (source, el, ctx) => {
					await renderLineageList(source, el, ctx, urlKey, baseUrl);
				});
				this.registerMarkdownCodeBlockProcessor(`dnd${urlKey}-class`, async (source, el, ctx) => {
					await renderClass(source, el, ctx, urlKey, baseUrl);
				});
				this.registerMarkdownCodeBlockProcessor(`dnd${urlKey}-classinfo`, async (source, el, ctx) => {
					await renderSubclass(source, el, ctx, urlKey, baseUrl);
				});
				this.registerMarkdownCodeBlockProcessor(`dnd${urlKey}-custom`, async (source, el, ctx) => {
					await renderCustom(source, el, ctx, urlKey, baseUrl);
				});
			}
		});

		// Kick off preload after initialization so Obsidian doesn't wait on it
		this.app.workspace.onLayoutReady(async () => {
			try {
				const urls = await peekBaseUrls();
				// Preload spells, feats, and items for every configured URL key
				for (const [urlKey, url] of Object.entries(urls)) {
					if (!url) continue;
					await preloadAllSpellNames(urlKey, url);
					await preloadAllFeatIds(urlKey, url);
					await preloadAllItemIds(urlKey, url);
					await preloadAllBackgroundIds(urlKey, url);
					await preloadAllLineageIds(urlKey, url);
				}
				await initData();
			} catch (e) {
				console.warn('Failed to preload data', e);
			}
		});

		// Add settings tab to show and edit Base URL
		this.addSettingTab(new DndCardsSettingTab(this.app, this));
	}
}
