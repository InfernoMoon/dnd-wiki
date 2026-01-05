import { App, Plugin, PluginSettingTab, Setting, TextComponent, Notice } from 'obsidian';
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

    // Add button to create custom cards folder structure
    new Setting(containerEl)
      .setName('Add Custom Cards')
      .setDesc('Create folder "DnD-Cards", to store your custom cards.')
      .addButton((btn) => {
        btn.setButtonText('Add Custom Cards')
          .setCta()
          .onClick(async () => {
            const vault = this.app.vault;
            const root = 'DnD-Cards';
            const subs = ['Spells', 'Feats'];

            try {
              // Ensure root folder exists
              if (!vault.getAbstractFileByPath(root)) {
                await vault.createFolder(root);
              }

              // Ensure subfolders exist
              for (const sub of subs) {
                const path = `${root}/${sub}`;
                if (!vault.getAbstractFileByPath(path)) {
                  await vault.createFolder(path);
                }
              }
              new Notice('You can now add your custom cards to the DnD-Cards folder!');
            } catch (err) {
              console.error('Failed creating DnD-Cards folders', err);
              new Notice('Failed to create folders. See console for details.');
            }
          });
      });
  }
}
