import { Plugin } from 'obsidian';
import { renderSpell } from './src/spell';
import { renderSpellList } from './src/spelllist';
import { initBaseUrlWatcher, configurePluginId, getBaseUrl } from './src/dataService';
import { preloadAllSpellNames } from './src/spellUtils';


export default class Dnd5eSpellCards extends Plugin {
	async onload() {
		configurePluginId(this.manifest.id);
		initBaseUrlWatcher(this);
		this.registerMarkdownCodeBlockProcessor('spell', async (source, el, ctx) => {
			await renderSpell(source, el, ctx);
		});
		// Preload all available spell names into memory once base URL is known
		try {
			const baseUrl = await getBaseUrl();
			if (baseUrl) await preloadAllSpellNames(baseUrl);
		} catch (e) {
			console.warn('Failed to preload spell names', e);
		}
		this.registerMarkdownCodeBlockProcessor('spelllist', async (source, el, ctx) => {
			await renderSpellList(source, el, ctx);
		});
	}
}
