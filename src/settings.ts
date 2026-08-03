import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import { peekBaseUrls, setBaseUrls } from './dataService';

function displayUrlEntries(container: HTMLElement, urls: Record<string, string>): void {
  container.empty();
  
  for (const [key, url] of Object.entries(urls)) {
    const entryDiv = container.createDiv('url-entry');
    entryDiv.style.marginBottom = '12px';
    entryDiv.style.borderLeft = '2px solid #999';
    entryDiv.style.paddingLeft = '12px';
    
    let currentKeyValue = key;
    let currentUrlValue = url;
    
    const inputRow = entryDiv.createDiv();
    inputRow.style.display = 'flex';
    inputRow.style.gap = '8px';
    inputRow.style.alignItems = 'center';
    
    new Setting(inputRow).addText((t) => {
      t.setValue(key)
        .setPlaceholder('e.g., 5e')
        .onChange((v) => { currentKeyValue = v; });
      t.inputEl.style.width = '100px';
    });
    
    new Setting(inputRow).addText((t) => {
      t.setValue(url)
        .setPlaceholder('https://example.com')
        .onChange((v) => { currentUrlValue = v; });
      t.inputEl.style.flex = '1';
    });
    
    const updateBtn = inputRow.createEl('button', { text: 'Save' });
    updateBtn.style.marginRight = '8px';
    updateBtn.onclick = async () => {
      const currentUrls = await peekBaseUrls();
      const newKey = currentKeyValue.trim();
      const newUrl = currentUrlValue.trim();
      
      if (!newKey) {
        new Notice('Key cannot be empty');
        return;
      }
      
      // Remove old key if renamed
      if (newKey !== key && key in currentUrls) {
        delete currentUrls[key];
      }
      
      currentUrls[newKey] = newUrl;
      await setBaseUrls(currentUrls);
      new Notice(`Saved URL for key "${newKey}"`);
    };
    
    const deleteBtn = inputRow.createEl('button', { text: 'Delete' });
    deleteBtn.style.color = '#d00';
    deleteBtn.onclick = async () => {
      const currentUrls = await peekBaseUrls();
      delete currentUrls[key];
      await setBaseUrls(currentUrls);
      new Notice(`Deleted URL for key "${key}"`);
      const updated = await peekBaseUrls();
      displayUrlEntries(container, updated);
    };
  }
  
  // Add new entry button
  const addBtn = container.createEl('button', { text: '+ Add URL' });
  addBtn.style.marginTop = '12px';
  addBtn.onclick = async () => {
    const currentUrls = await peekBaseUrls();
    // Generate a unique key
    let newKey = 'custom';
    let counter = 1;
    while (newKey in currentUrls) {
      newKey = `custom${counter++}`;
    }
    currentUrls[newKey] = '';
    await setBaseUrls(currentUrls);
    displayUrlEntries(container, currentUrls);
  };
}

export class DndCardsSettingTab extends PluginSettingTab {
  constructor(app: App, plugin: Plugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'DnD 5e Cards Settings' });
    
    containerEl.createEl('h3', { text: 'Base URLs' });
    containerEl.createEl('p', { text: 'Define multiple base URLs with custom keys. Examples: "5e" for 5e.tools, "2024" for 2024 revision.' });
    
    const urlsContainer = containerEl.createDiv('urls-container');
    
    // Load and display URLs
    peekBaseUrls().then((urls) => {
      // Ensure default keys exist
      const merged = { '5e': '', '2024': '', ...urls };
      displayUrlEntries(urlsContainer, merged);
    });
    
    containerEl.createEl('hr');


    // Add button to create custom cards folder structure
    new Setting(containerEl)
      .setName('Add Custom Cards')
      .setDesc('Create folder "DnD-Cards", to store your custom cards. You might need to restart Obsidian to see your custom cards in suggestions.')
      .addButton((btn) => {
        btn.setButtonText('Add Custom Cards')
          .setCta()
          .onClick(async () => {
            const vault = this.app.vault;
            const root = 'DnD-Cards';
            const subs = ['Spells', 'Feats', 'Items'];

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

              // Create sample custom feat files in the Feats folder
              const featsFolder = `${root}/Feats`;
              const featTemplatePath = `${featsFolder}/Custom Feat.md`;
              const luckyPath = `${featsFolder}/Custom Lucky.md`;

              if (!vault.getAbstractFileByPath(featTemplatePath)) {
                const featTemplateContent = [
                  '```',
                  'prerequisite:',
                  'description: ""',
                  '```'
                ].join('\n');
                await vault.create(featTemplatePath, featTemplateContent);
              }

              if (!vault.getAbstractFileByPath(luckyPath)) {
                const luckyContent = [
                  '```',
                  'prerequisite:',
                  'description: "You have inexplicable luck that seems to kick in at just the right moment.',
                  '',
                  'You have 3 luck points. Whenever you make an attack roll, an ability check, or a saving throw, you can spend one luck point to roll an additional d20. You can choose to spend one of your luck points after you roll the die, but before the outcome is determined. You choose which of the d20s is used for the attack roll, ability check, or saving throw.',
                  '',
                  'You can also spend one luck point when an attack roll is made against you. Roll a d20 and then choose whether the attack uses the attacker\'s roll or yours.',
                  '',
                  'If more than one creature spends a luck point to influence the outcome of a roll, the points cancel each other out; no additional dice are rolled.',
                  '',
                  'You regain your expended luck points when you finish a long rest."',
                  '```'
                ].join('\n');
                await vault.create(luckyPath, luckyContent);
              }

              // Create sample custom item files in the Items folder
              const itemsFolder = `${root}/Items`;
              const customItemTemplatePath = `${itemsFolder}/Custom Item.md`;
              const bagOfHoldingPath = `${itemsFolder}/Custom Bag of Holding.md`;

              if (!vault.getAbstractFileByPath(customItemTemplatePath)) {
                const customItemTemplateContent = [
                  '```',
                  'type: ',
                  'level: ',
                  'attuned: ',
                  'description: ""',
                  '```'
                ].join('\n');
                await vault.create(customItemTemplatePath, customItemTemplateContent);
              }

              if (!vault.getAbstractFileByPath(bagOfHoldingPath)) {
                const bagOfHoldingContent = [
                  '```',
                  'type: Wondrous Item',
                  'level: Uncommon',
                  'attuned: Not-Required',
                  'description: "This bag has an interior space considerably larger than its outside dimensions, roughly 2 feet in diameter at the mouth and 4 feet deep. The bag can hold up to 500 pounds, not exceeding a volume of 64 cubic feet. The bag weighs 15 pounds, regardless of its contents. Retrieving an item from the bag requires an action.',
                  '',
                  'If the bag is overloaded, pierced, or torn, it ruptures and is destroyed, and its contents are scattered in the Astral Plane. If the bag is turned inside out, its contents spill forth, unharmed, but the bag must be put right before it can be used again. Breathing creatures inside the bag can survive up to a number of minutes equal to 10 divided by the number of creatures (minimum 1 minute), after which time they begin to suffocate.',
                  '',
                  'Placing a bag of holding inside an extradimensional space created by a _Heward\'s Handy Haversack, Portable Hole_, or similar item instantly destroys both items and opens a gate to the Astral Plane. The gate originates where the one item was placed inside the other. Any creature within 10 feet of the gate is sucked through it to a random location on the Astral Plane. The gate then closes. The gate is one-way only and can\'t be reopened."',
                  '```'
                ].join('\n');
                await vault.create(bagOfHoldingPath, bagOfHoldingContent);
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
