import { Plugin } from 'obsidian';
import { renderSpell } from './src/spell';
import { renderSpellList } from './src/spelllist';
import { initBaseUrlWatcher, configurePluginId } from './src/dataService';


export default class Dnd5eSpellCards extends Plugin {
	async onload() {
		configurePluginId(this.manifest.id);
		initBaseUrlWatcher(this);
		this.registerMarkdownCodeBlockProcessor('spell', async (source, el, ctx) => {
			await renderSpell(source, el, ctx);
		});
		this.registerMarkdownCodeBlockProcessor('spelllist', async (source, el, ctx) => {
			await renderSpellList(source, el, ctx);
		});
	}
}
