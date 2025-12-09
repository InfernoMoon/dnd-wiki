import { Plugin } from 'obsidian';
import { renderSpell } from './src/spells';
import { initBaseUrlWatcher, configurePluginId } from './src/dataService';


export default class Dnd5eSpellCards extends Plugin {
	async onload() {
		configurePluginId(this.manifest.id);
		initBaseUrlWatcher(this);
		this.registerMarkdownCodeBlockProcessor('spell', async (source, el, ctx) => {
			await renderSpell(source, el, ctx);
		});
	}
}
