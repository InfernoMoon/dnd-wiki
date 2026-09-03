import { Plugin } from 'obsidian';
import { renderSpell } from './src/dnd/spells/spell';
import { renderSpellList } from './src/dnd/spells/spelllist';
import { renderFeat } from './src/dnd/feats/feat';
import { renderItem } from './src/dnd/items/item';
import { configurePluginRef, peekBaseUrls, initializeDefaultUrls } from './src/settings/settingsService';
import { preloadAllSpellNames } from './src/dnd/spells/spellUtils';
import { SpellNameSuggest } from './src/suggest/suggestSpell';
import { SpellListSuggest } from './src/suggest/suggestSpellList';
import { FeatNameSuggest } from './src/suggest/suggestFeat';
import { ItemNameSuggest } from './src/suggest/suggestItem';
import { ItemListSuggest } from './src/suggest/suggestItemList';
import { EquipmentListSuggest } from './src/suggest/suggestEquipmentList';
import { renderEquipment } from './src/dnd/equipment/equipment';
import { renderEquipmentList } from './src/dnd/equipment/equipmentList';
import { WeaponListSuggest } from './src/suggest/suggestWeaponList';
import { WeaponNameSuggest } from './src/suggest/suggestWeapon';
import { renderWeapon } from './src/dnd/weapons/weapon';
import { renderWeaponList } from './src/dnd/weapons/weaponList';
import { BackgroundNameSuggest } from './src/suggest/suggestBackground';
import { FeatListSuggest } from './src/suggest/suggestFeatList';
import { BackgroundListSuggest } from './src/suggest/suggestBackgroundList';
import { LineageNameSuggest } from './src/suggest/suggestLineage';
import { LineageListSuggest } from './src/suggest/suggestLineageList';
import { ClassNameSuggest } from './src/suggest/suggestClass';
import { SubclassNameSuggest } from './src/suggest/suggestSubclass';
import { preloadAllFeatIds } from './src/dnd/feats/featService';
import { preloadAllItemIds } from './src/dnd/items/itemService';
import { preloadAllBackgroundIds } from './src/dnd/backgrounds/backgroundService';
import { preloadAllLineageIds } from './src/dnd/lineages/lineageService';
import { preloadAllWeaponNames } from './src/dnd/weapons/weaponService';
import { renderFeatList } from './src/dnd/feats/featList';
import { renderItemList } from './src/dnd/items/itemList';
import { renderBackground } from './src/dnd/backgrounds/background';
import { renderBackgroundList } from './src/dnd/backgrounds/backgroundList';
import { renderLineage } from './src/dnd/lineages/lineage';
import { renderLineageList } from './src/dnd/lineages/lineageList';
import { renderClass } from './src/dnd/classes/class';
import { renderSubclass } from './src/dnd/classes/subclass';
import { DndPrefixSuggest } from './src/suggestDndPrefix';
import { DndCardsSettingTab } from './src/settings/settings';
import { renderCustom } from './src/dnd/custom/custom';
import { CustomSuggest } from './src/suggest/suggestCustom';
import { BaseTextSuggest } from './src/suggest/baseSuggest';
import { isBlankLineInsideDndBlock } from './src/suggest/suggestHelpers';
import { ensureHomebrewPropertyTypes } from './src/homebrew/homebrew';
import { registerHomebrewFileCommand } from './src/homebrew/homebrewCommand';


export default class DndWiki extends Plugin {
	async onload() {
		configurePluginRef(this);
		registerHomebrewFileCommand(this.app, (command) => this.addCommand(command));
		void ensureHomebrewPropertyTypes(this.app.vault.adapter).catch((error: unknown) => {
			console.warn('DnD Wiki: Failed to ensure homebrew property types', error);
		});
		await initializeDefaultUrls();
		const editorSuggesters: BaseTextSuggest[] = [];
		const urlsSnapshot = await peekBaseUrls();
		const registerSuggest = <T extends BaseTextSuggest>(suggest: T): T => {
			this.registerEditorSuggest(suggest);
			editorSuggesters.push(suggest);
			return suggest;
		};

		const dndPrefixSuggest = new DndPrefixSuggest(this);
		await dndPrefixSuggest.refreshUrlKeys();
		registerSuggest(dndPrefixSuggest);

		registerSuggest(new SpellNameSuggest(this));
		registerSuggest(new SpellListSuggest(this));
		registerSuggest(new FeatNameSuggest(this));
		registerSuggest(new FeatListSuggest(this));
		registerSuggest(new ItemNameSuggest(this));
		registerSuggest(new ItemListSuggest(this));
		registerSuggest(new EquipmentListSuggest(this));
		registerSuggest(new WeaponNameSuggest(this));
		registerSuggest(new WeaponListSuggest(this, (urlKey) => urlsSnapshot[urlKey] || ''));
		registerSuggest(new BackgroundNameSuggest(this));
		registerSuggest(new BackgroundListSuggest(this));
		registerSuggest(new LineageNameSuggest(this));
		registerSuggest(new LineageListSuggest(this));

		const classNameSuggest = new ClassNameSuggest(this);
		await classNameSuggest.refreshClassNames();
		registerSuggest(classNameSuggest);
		registerSuggest(new SubclassNameSuggest(this, (urlKey) => urlsSnapshot[urlKey] || ''));
		registerSuggest(new CustomSuggest(this));

		this.registerEvent(this.app.workspace.on('editor-change', (editor, info) => {
			const file = info.file;
			const cursor = editor.getCursor();
			if (!file || !isBlankLineInsideDndBlock(cursor, editor)) return;

			window.setTimeout(() => {
				const currentCursor = editor.getCursor();
				if (currentCursor.line !== cursor.line || currentCursor.ch !== cursor.ch) return;
				for (const suggest of editorSuggesters) {
					if (suggest.openAtCursor(editor, file)) break;
				}
			}, 0);
		}));
		
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
				this.registerMarkdownCodeBlockProcessor(`dnd${urlKey}-equipment`, async (source, el, ctx) => {
					await renderEquipment(source, el, ctx, urlKey, baseUrl);
				});
				this.registerMarkdownCodeBlockProcessor(`dnd${urlKey}-equipmentlist`, async (source, el, ctx) => {
					await renderEquipmentList(source, el, ctx, urlKey, baseUrl);
				});
				this.registerMarkdownCodeBlockProcessor(`dnd${urlKey}-weapon`, async (source, el, ctx) => {
					await renderWeapon(source, el, ctx, urlKey, baseUrl);
				});
				this.registerMarkdownCodeBlockProcessor(`dnd${urlKey}-weaponlist`, async (source, el, ctx) => {
					await renderWeaponList(source, el, ctx, urlKey, baseUrl);
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
					await preloadAllWeaponNames(urlKey, url);
				}
			} catch (e) {
				console.warn('Failed to preload data', e);
			}
		});

		// Add settings tab to show and edit Base URL
		this.addSettingTab(new DndCardsSettingTab(this.app, this));
	}
}
