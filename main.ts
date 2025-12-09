import { Plugin } from 'obsidian';

export default class Dnd5eSpellCards extends Plugin {
	async onload() {
		this.registerMarkdownCodeBlockProcessor('spell', (_source, el, _ctx) => {
			el.empty();
			const box = el.createDiv();
			box.setText('Test Spell');
		});
	}

	onunload() {}
}
