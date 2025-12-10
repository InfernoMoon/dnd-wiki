import { App, Plugin, PluginSettingTab, Setting, TextComponent } from 'obsidian';
import { peekBaseUrl, setBaseUrl } from './dataService';

export class DndCardsSettingTab extends PluginSettingTab {
  constructor(app: App, plugin: Plugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'DnD 5e Cards Settings' });
    let baseInput: TextComponent | null = null;
    new Setting(containerEl)
      .setName('Base URL')
      .setDesc('The root URL used to fetch DnD Data.')
      .addText((text) => {
        baseInput = text;
        text.setPlaceholder('https://example.com')
          .setValue('')
          .onChange(async (value) => {
            await setBaseUrl(value.trim());
          });
      });
    // Populate without prompting
    peekBaseUrl().then((current) => {
      if (current && baseInput) {
        baseInput.setValue(current);
      }
    });
  }
}
