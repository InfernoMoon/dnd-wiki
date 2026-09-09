import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import { peekBaseUrls, setBaseUrls } from './settingsService';
import { DEFAULT_HOMEBREW_FOLDER, getHomebrewSettings, setHomebrewSettings } from '../homebrew/homebrewSettings';
import type { HomebrewSettings } from '../homebrew/homebrewSettings';
import { ensureHomebrewFolderPath } from '../homebrew/homebrew';
import { updateHomebrewFiles } from '../homebrew/homebrew';
import { createHomebrewTemplateFolders } from '../homebrew/homebrewTemplates';
import { openHomebrewFileModal } from '../homebrew/homebrewCommand';

interface DeclarativeSettingDefinition {
  name?: string;
  desc?: string;
  type?: 'group';
  heading?: string;
  items?: DeclarativeSettingDefinition[];
  render?: (setting: Setting) => void;
}

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

  /** Declarative definitions enable settings search in Obsidian 1.13+. */
  getSettingDefinitions(): DeclarativeSettingDefinition[] {
    const homebrewItems: DeclarativeSettingDefinition[] = [
      {
        name: 'Homebrew template folder',
        desc: 'Folder path relative to the vault root.',
        render: (setting) => {
          void this.withHomebrewSettings(setting, (row, settings) => {
            row.addText((text) => {
              text.setPlaceholder(DEFAULT_HOMEBREW_FOLDER)
                .setValue(settings.folderPath)
                .onChange((value) => {
                  settings.folderPath = value;
                  void setHomebrewSettings(settings).catch((error: unknown) => {
                    console.warn('DnD Wiki: Failed to save homebrew folder setting', error);
                  });
                });
            });
          });
        },
      },
      {
        name: 'Search the entire vault for homebrew templates',
        desc: 'Find tagged homebrew files anywhere in the vault instead of only in the homebrew folder.',
        render: (setting) => {
          void this.withHomebrewSettings(setting, (row, settings) => {
            row.addToggle((toggle) => {
              toggle.setValue(settings.searchEntireVault).onChange((value) => {
                settings.searchEntireVault = value;
                void setHomebrewSettings(settings).catch((error: unknown) => {
                  console.warn('DnD Wiki: Failed to save homebrew search setting', error);
                });
              });
            });
          });
        },
      },
      {
        name: 'Create homebrew templates',
        desc: 'Create templates for spells, feats, backgrounds, lineages, magic items, and weapons.',
        render: (setting) => {
          setting.addButton((button) => {
            button.setButtonText('Create templates')
              .setCta()
              .onClick(() => {
                void getHomebrewSettings()
                  .then((settings) => ensureHomebrewFolderPath(this.app.vault, settings))
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
        },
      },
      {
        name: 'Add homebrew file',
        desc: 'Create and open a spell, feat, background, lineage, magic item, or weapon file.',
        render: (setting) => {
          setting.addButton((button) => {
            button.setButtonText('Add file')
              .setCta()
              .onClick(() => openHomebrewFileModal(this.app));
          });
        },
      },
      {
        name: 'Ignored homebrew file and folder prefixes',
        desc: 'Comma-separated file and folder prefixes to exclude when finding homebrew files.',
        render: (setting) => {
          void this.withHomebrewSettings(setting, (row, settings) => {
            row.addText((text) => {
              text.setValue(settings.ignoredFilePrefixes.join(', '))
                .setPlaceholder('_')
                .onChange((value) => {
                  settings.ignoredFilePrefixes = parseSuggestionValues(value);
                  void setHomebrewSettings(settings).catch((error: unknown) => {
                    console.warn('DnD Wiki: Failed to save ignored homebrew file prefixes', error);
                  });
                });
            });
          });
        },
      },
      {
        name: 'Refresh homebrew',
        desc: 'Find homebrew files using the current settings.',
        render: (setting) => {
          setting.addButton((button) => {
            button.setButtonText('Refresh homebrew').onClick(() => {
              void getHomebrewSettings()
                .then((settings) => updateHomebrewFiles(this.app.vault, this.app.metadataCache, settings))
                .then(() => new Notice('Homebrew refreshed.'))
                .catch((error: unknown) => {
                  console.error('DnD Wiki: Failed to refresh homebrew files', error);
                  new Notice('Failed to refresh homebrew files. See the console for details.');
                });
            });
          });
        },
      },
      ...([
        ['classes', 'Additional classes'],
        ['magicSchools', 'Additional magic schools'],
        ['weaponTypes', 'Additional weapon types'],
        ['magicItemTypes', 'Additional magic item types'],
      ] as const).map(([key, name]) => ({
        name,
        render: (setting: Setting) => {
          void this.withHomebrewSettings(setting, (row, settings) => {
            row.addText((text) => {
              text.setValue(settings[key].join(', '))
                .setPlaceholder('Comma-separated values')
                .onChange((value) => {
                  settings[key] = parseSuggestionValues(value);
                  void setHomebrewSettings(settings).catch((error: unknown) => {
                    console.warn('DnD Wiki: Failed to save homebrew suggestion values', error);
                  });
                });
            });
          });
        },
      })),
    ];

    return [{ type: 'group', heading: 'Homebrew templates', items: homebrewItems }];
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const homebrewContainer = containerEl.createDiv('dnd-wiki-homebrew-settings');
    void this.displayHomebrewSettings(homebrewContainer).catch((error: unknown) => {
      console.warn('DnD Wiki: Failed to load homebrew settings', error);
    });

    // Source URL settings are kept for later, but are currently hidden from the UI.
  }

  private displaySourceUrlSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Source URLs')
      .setHeading();
    const sourceUrlContent = containerEl.createDiv('dnd-wiki-source-url-content');
    sourceUrlContent.createEl('p', { text: 'Define multiple source URLs, like for 5e or 2024.' });
    sourceUrlContent.createEl('p', { text: 'Obsidian might need to be restarted after adding or removing URLs.' });

    const urlsContainer = sourceUrlContent.createDiv('urls-container');
    void peekBaseUrls()
      .then((urls) => displayUrlEntries(urlsContainer, urls))
      .catch((error: unknown) => {
        console.warn('DnD Wiki: Failed to load source URLs', error);
      });
  }

  private async displayHomebrewSettings(containerEl: HTMLElement): Promise<void> {
    const settings = await getHomebrewSettings();

    new Setting(containerEl)
      .setName('Homebrew templates')
      .setHeading();

    new Setting(containerEl)
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

    new Setting(containerEl)
      .setName('Search the entire vault for homebrew templates')
      .setDesc('Find tagged homebrew files anywhere in the vault instead of only in the homebrew folder.')
      .addToggle((toggle) => {
        toggle.setValue(settings.searchEntireVault).onChange((value) => {
          settings.searchEntireVault = value;
          void setHomebrewSettings(settings).catch((error: unknown) => {
            console.warn('DnD Wiki: Failed to save homebrew search setting', error);
          });
        });
      });

    new Setting(containerEl)
      .setName('Create homebrew templates')
      .setDesc('Create templates for spells, feats, backgrounds, lineages, magic items, and weapons.')
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

    new Setting(containerEl)
      .setName('Add homebrew file')
      .setDesc('Create and open a spell, feat, background, lineage, magic item, or weapon file. This is the same as the Create homebrew file command.')
      .addButton((button) => {
        button.setButtonText('Add file')
          .setCta()
          .onClick(() => openHomebrewFileModal(this.app));
      });

    new Setting(containerEl)
      .setName('Ignored homebrew file and folder prefixes')
      .setDesc('Comma-separated file and folder prefixes to exclude when finding homebrew files.')
      .addText((text) => {
        text.setValue(settings.ignoredFilePrefixes.join(', '))
          .setPlaceholder('_')
          .onChange((value) => {
            settings.ignoredFilePrefixes = parseSuggestionValues(value);
            void setHomebrewSettings(settings).catch((error: unknown) => {
              console.warn('DnD Wiki: Failed to save ignored homebrew file prefixes', error);
            });
          });
      });

    new Setting(containerEl)
      .setName('Refresh homebrew')
      .setDesc('Find and cache homebrew files using the current settings.')
      .addButton((button) => {
        button.setButtonText('Refresh homebrew')
          .onClick(() => {
            void getHomebrewSettings()
              .then((currentSettings) => updateHomebrewFiles(
                this.app.vault,
                this.app.metadataCache,
                currentSettings,
              ))
              .then(() => new Notice('Homebrew refreshed.'))
              .catch((error: unknown) => {
                console.error('DnD Wiki: Failed to refresh homebrew files', error);
                new Notice('Failed to refresh homebrew files. See the console for details.');
              });
          });
      });

    const suggestionDetails = containerEl.createEl('details', {
      cls: 'dnd-wiki-homebrew-suggestion-values',
    });
    suggestionDetails.createEl('summary', { text: 'Homebrew suggestion values' });
    const suggestionContainer = suggestionDetails.createDiv();
    suggestionContainer.createEl('p', {
      text: 'Add comma-separated values to include them alongside the built-in suggestions.',
    });
    this.addSuggestionValueSetting(suggestionContainer, settings, 'classes', 'Additional classes');
    this.addSuggestionValueSetting(suggestionContainer, settings, 'magicSchools', 'Additional magic schools');
    this.addSuggestionValueSetting(suggestionContainer, settings, 'weaponTypes', 'Additional weapon types');
    this.addSuggestionValueSetting(suggestionContainer, settings, 'magicItemTypes', 'Additional magic item types');
  }

  private async withHomebrewSettings(
    setting: Setting,
    render: (setting: Setting, settings: HomebrewSettings) => void,
  ): Promise<void> {
    try {
      render(setting, await getHomebrewSettings());
    } catch (error: unknown) {
      console.warn('DnD Wiki: Failed to load homebrew settings', error);
    }
  }

  private addSuggestionValueSetting(
    containerEl: HTMLElement,
    settings: HomebrewSettings,
    key: 'classes' | 'magicSchools' | 'weaponTypes' | 'magicItemTypes',
    name: string,
  ): void {
    new Setting(containerEl)
      .setName(name)
      .addText((text) => {
        text.setValue(settings[key].join(', '))
          .setPlaceholder('Comma-separated values')
          .onChange((value) => {
            settings[key] = parseSuggestionValues(value);
            void setHomebrewSettings(settings).catch((error: unknown) => {
              console.warn('DnD Wiki: Failed to save homebrew suggestion values', error);
            });
          });
      });
  }
}

function parseSuggestionValues(value: string): string[] {
  return Array.from(new Map(value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => [entry.toLowerCase(), entry] as const)).values());
}
