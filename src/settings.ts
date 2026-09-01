import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import {
  DEFAULT_HOMEBREW_FOLDER,
  getHomebrewSettings,
  peekBaseUrls,
  setBaseUrls,
  setHomebrewSettings,
} from './dataService';
import { ensureHomebrewFolderPath } from './homebrew/homebrew';
import { createHomebrewTemplateFolders } from './homebrew/homebrewTemplates';

function displayUrlEntries(container: HTMLElement, urls: Record<string, string>): void {
  container.empty();

  for (const [key, url] of Object.entries(urls)) {
    const entryDiv = container.createDiv('url-entry');
    entryDiv.addClass('dnd-wiki-url-entry');

    let currentKeyValue = key;
    let currentUrlValue = url;
    let saveTimeout: number | null = null;

    const autoSave = async (): Promise<void> => {
      const newKey = currentKeyValue.trim();
      const newUrl = currentUrlValue.trim();
      if (!newKey) return;
      const currentUrls = await peekBaseUrls();
      if (newKey !== key && key in currentUrls) delete currentUrls[key];
      currentUrls[newKey] = newUrl;
      await setBaseUrls(currentUrls);
    };

    const scheduleAutoSave = (): void => {
      if (saveTimeout) window.clearTimeout(saveTimeout);
      saveTimeout = window.setTimeout(() => {
        void autoSave().catch((error: unknown) => {
          console.warn('DnD Wiki: Failed to save source URL', error);
        });
      }, 600);
    };

    const inputRow = entryDiv.createDiv();
    inputRow.addClass('dnd-wiki-url-input-row');

    new Setting(inputRow).addText((text) => {
      text.setValue(key)
        .setPlaceholder('e.g., 5e')
        .onChange((value) => { currentKeyValue = value; scheduleAutoSave(); });
      text.inputEl.addClass('dnd-wiki-url-key-input');
    });

    new Setting(inputRow).addText((text) => {
      text.setValue(url)
        .setPlaceholder('https://example.com')
        .onChange((value) => { currentUrlValue = value; scheduleAutoSave(); });
      text.inputEl.addClass('dnd-wiki-url-value-input');
    });

    const deleteBtn = inputRow.createEl('button', { text: 'Delete' });
    deleteBtn.addClass('dnd-wiki-delete-url-button');
    deleteBtn.onclick = (): void => {
      if (saveTimeout) window.clearTimeout(saveTimeout);
      void (async (): Promise<void> => {
        const currentUrls = await peekBaseUrls();
        delete currentUrls[key];
        await setBaseUrls(currentUrls);
        displayUrlEntries(container, await peekBaseUrls());
      })().catch((error: unknown) => {
        console.warn('DnD Wiki: Failed to delete source URL', error);
      });
    };
  }

  const addBtn = container.createEl('button', { text: '+ Add URL' });
  addBtn.addClass('dnd-wiki-add-url-button');
  addBtn.onclick = (): void => {
    void (async (): Promise<void> => {
      const currentUrls = await peekBaseUrls();
      let newKey = 'custom';
      let counter = 1;
      while (newKey in currentUrls) newKey = `custom${counter++}`;
      currentUrls[newKey] = '';
      await setBaseUrls(currentUrls);
      displayUrlEntries(container, currentUrls);
    })().catch((error: unknown) => {
      console.warn('DnD Wiki: Failed to add source URL', error);
    });
  };
}

export class DndCardsSettingTab extends PluginSettingTab {
  constructor(app: App, plugin: Plugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Source URLs')
      .setHeading();
    containerEl.createEl('p', { text: 'Define multiple source URLs, like for 5e or 2024.' });
    containerEl.createEl('p', { text: 'Obsidian might need to be restarted after adding or removing URLs.' });

    const urlsContainer = containerEl.createDiv('urls-container');
    void peekBaseUrls()
      .then((urls) => displayUrlEntries(urlsContainer, urls))
      .catch((error: unknown) => {
        console.warn('DnD Wiki: Failed to load source URLs', error);
      });

    containerEl.createEl('hr');
    void this.displayHomebrewSettings(containerEl).catch((error: unknown) => {
      console.warn('DnD Wiki: Failed to load homebrew settings', error);
    });
  }

  private async displayHomebrewSettings(containerEl: HTMLElement): Promise<void> {
    const settings = await getHomebrewSettings();
    const homebrewContainer = containerEl.createDiv('dnd-wiki-homebrew-settings');

    new Setting(homebrewContainer)
      .setName('Homebrew templates')
      .setHeading();

    new Setting(homebrewContainer)
      .setName('Search the entire vault for homebrew templates')
      .setDesc('Reserved for a future option to find homebrew files anywhere in the vault.')
      .addToggle((toggle) => {
        toggle.setValue(settings.searchEntireVault).onChange((value) => {
          settings.searchEntireVault = value;
          void setHomebrewSettings(settings).catch((error: unknown) => {
            console.warn('DnD Wiki: Failed to save homebrew search setting', error);
          });
        });
      });

    new Setting(homebrewContainer)
      .setName('Homebrew template folder')
      .setDesc('Folder path relative to the vault root.')
      .addText((text) => {
        text.setPlaceholder(DEFAULT_HOMEBREW_FOLDER)
          .setValue(settings.folderPath)
          .onChange((value) => {
            settings.folderPath = value;
            void setHomebrewSettings(settings).catch((error: unknown) => {
              console.warn('DnD Wiki: Failed to save homebrew folder setting', error);
            });
          });
      });

    new Setting(homebrewContainer)
      .setName('Create homebrew templates')
      .setDesc('Create templates for spells, feats, backgrounds, lineages, and magic items.')
      .addButton((button) => {
        button.setButtonText('Create templates')
          .setCta()
          .onClick(() => {
            void ensureHomebrewFolderPath(this.app.vault, settings)
              .then((rootPath) => createHomebrewTemplateFolders(this.app.vault, rootPath))
              .then((result) => {
                const message = result.createdPaths.length === 0 && result.createdFiles.length === 0
                  ? 'Homebrew templates already exist.'
                  : 'Homebrew templates created.';
                new Notice(message);
              })
              .catch((error: unknown) => {
                console.error('DnD Wiki: Failed to create homebrew template folders', error);
                new Notice('Failed to create homebrew template folders. See the console for details.');
              });
          });
      });
  }
}
