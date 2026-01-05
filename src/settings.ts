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

              // Create sample custom spell files in the Spells folder
              const spellsFolder = `${root}/Spells`;
              const fireballPath = `${spellsFolder}/Custom Fireball.md`;
              const templatePath = `${spellsFolder}/Custom Spell.md`;

              if (!vault.getAbstractFileByPath(fireballPath)) {
                const fireballContent = [
                  '```',
                  'level: 3',
                  'casting-time:\u00A01 action',
                  'range: 150 feet',
                  'components: V,S,M (a tiny ball of bat guano and sulfur)',
                  'duration: Instantaneous',
                  'spell-lists: Sorcerer,\u00A0Wizard',
                  'school: Evocation',
                  'description: "A bright streak flashes from your pointing finger to a point you choose within range then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot radius must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one. The fire spreads around corners. It ignites flammable objects in the area that aren’t being worn or carried.',
                  '',
                  '**_At Higher Levels._**\u00A0When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd."',
                  '```'
                ].join('\n');
                await vault.create(fireballPath, fireballContent);
              }

              if (!vault.getAbstractFileByPath(templatePath)) {
                const templateContent = [
                  '```',
                  'level: ',
                  'casting-time:\u00A0',
                  'range: ',
                  'components: ',
                  'duration: ',
                  'spell-lists: ',
                  'school: ',
                  'description: ""',
                  '```'
                ].join('\n');
                await vault.create(templatePath, templateContent);
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
