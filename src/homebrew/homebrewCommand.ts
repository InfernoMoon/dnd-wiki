import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import { getCachedClassNames, getCachedSchoolNames, getHomebrewSettings, getItemRarityNames } from '../dataService';
import { getItemTypeSuggestions } from '../items/itemUtils';
import { ensureHomebrewFolderPath } from './homebrew';
import { ensureHomebrewCategoryFolder, getHomebrewFileTemplate, HOMEBREW_CATEGORIES } from './homebrewTemplates';
import type { HomebrewFileTemplateOptions } from './homebrewTemplates';

const CATEGORY_LABELS: Record<string, string> = {
	Spells: 'Spell',
	Feats: 'Feat',
	Backgrounds: 'Background',
	Lineages: 'Lineage',
	'Magic Items': 'Magic item',
};

type HomebrewFileDestination = 'homebrew' | 'current';

export class HomebrewFileModal extends Modal {
	private category = 'Spells';
	private fileName = '';
	private destination: HomebrewFileDestination = 'homebrew';
	private spellLevel = '';
	private spellSchool = '';
	private spellClasses: string[] = [];
	private itemLevel = '';
	private itemType = '';
	private itemRequiresAttunement = false;

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		new Setting(contentEl)
			.setName('Create homebrew file')
			.setHeading();

		const categorySettings = contentEl.createDiv({ cls: 'dnd-wiki-homebrew-category-settings' });

		new Setting(contentEl)
			.setName('Category')
			.addDropdown((dropdown) => {
				for (const category of HOMEBREW_CATEGORIES) {
					dropdown.addOption(category, CATEGORY_LABELS[category] ?? category);
				}
				dropdown.setValue(this.category).onChange((value) => {
					this.category = value;
					this.renderCategorySettings(categorySettings);
				});
			});

		new Setting(contentEl)
			.setName('File name')
			.addText((text) => {
				text.setPlaceholder('e.g., Fireball')
					.onChange((value) => { this.fileName = value; });
			});

		contentEl.appendChild(categorySettings);
		this.renderCategorySettings(categorySettings);

		new Setting(contentEl)
			.setName('Create in')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('homebrew', 'Homebrew folder')
					.addOption('current', 'Current folder')
					.setValue(this.destination)
					.onChange((value) => {
						this.destination = value === 'current' ? 'current' : 'homebrew';
					});
			});

		new Setting(contentEl)
			.addButton((button) => {
				button.setButtonText('Create and open')
					.setCta()
					.onClick(() => {
						void this.createAndOpenFile().catch((error: unknown) => {
							console.error('DnD Wiki: Failed to create homebrew file', error);
							new Notice('Failed to create homebrew file. See the console for details.');
						});
					});
			})
			.addButton((button) => {
				button.setButtonText('Cancel').onClick(() => this.close());
			});
	}

	private renderCategorySettings(containerEl: HTMLElement): void {
		containerEl.empty();
		if (this.category === 'Spells') {
			this.renderSpellSettings(containerEl);
		} else if (this.category === 'Magic Items') {
			this.renderMagicItemSettings(containerEl);
		}
	}

	private renderSpellSettings(containerEl: HTMLElement): void {

		new Setting(containerEl)
			.setName('Spell level')
			.addDropdown((dropdown) => {
				dropdown.addOption('', 'Select a level');
				for (let level = 0; level <= 9; level++) {
					dropdown.addOption(String(level), String(level));
				}
				dropdown.setValue(this.spellLevel).onChange((value) => {
					this.spellLevel = value;
				});
			});

		new Setting(containerEl)
			.setName('Spell school')
			.addDropdown((dropdown) => {
				dropdown.addOption('', 'Select a school');
				for (const school of getCachedSchoolNames()) {
					dropdown.addOption(school, school);
				}
				dropdown.setValue(this.spellSchool).onChange((value) => {
					this.spellSchool = value;
				});
			});

		new Setting(containerEl)
			.setName('Spell classes')
			.setDesc('Select all classes that can use this spell.');

		containerEl.createDiv({ cls: 'dnd-wiki-homebrew-class-grid-spacer' });
		const classGrid = containerEl.createDiv({
			cls: 'dnd-wiki-homebrew-class-grid',
		});

		for (const className of getCachedClassNames()) {
			new Setting(classGrid)
				.setName(className)
				.addToggle((toggle) => {
					toggle
						.setValue(this.spellClasses.includes(className))
						.onChange((enabled) => {
							if (enabled && !this.spellClasses.includes(className)) {
								this.spellClasses.push(className);
							} else if (!enabled) {
								this.spellClasses = this.spellClasses.filter((selected) => selected !== className);
							}
						});
				});
		}
	}

	private renderMagicItemSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Item rarity')
			.addDropdown((dropdown) => {
				dropdown.addOption('', 'Select a rarity');
				for (const rarity of getItemRarityNames()) {
					dropdown.addOption(rarity, rarity.replace('-', ' '));
				}
				dropdown.setValue(this.itemLevel).onChange((value) => {
					this.itemLevel = value;
				});
			});

		new Setting(containerEl)
			.setName('Item type')
			.addDropdown((dropdown) => {
				dropdown.addOption('', 'Select a type');
				for (const itemType of getItemTypeSuggestions()) {
					dropdown.addOption(itemType, itemType);
				}
				dropdown.setValue(this.itemType).onChange((value) => {
					this.itemType = value;
				});
			});

		new Setting(containerEl)
			.setName('Requires attunement')
			.addToggle((toggle) => {
				toggle.setValue(this.itemRequiresAttunement).onChange((value) => {
					this.itemRequiresAttunement = value;
				});
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async createAndOpenFile(): Promise<void> {
		const baseName = this.fileName.trim().replace(/\.md$/i, '');
		if (!baseName) {
			new Notice('Enter a file name first.');
			return;
		}
		if (/[\\/]/.test(baseName)) {
			new Notice('File names cannot contain folder separators.');
			return;
		}

		let targetFolder = '';
		if (this.destination === 'homebrew') {
			const settings = await getHomebrewSettings();
			const rootPath = await ensureHomebrewFolderPath(this.app.vault, settings);
			targetFolder = await ensureHomebrewCategoryFolder(this.app.vault, rootPath, this.category);
		} else {
			const activeFile = this.app.workspace.getActiveFile();
			targetFolder = activeFile?.parent?.path ?? '';
		}

		const filePath = targetFolder ? `${targetFolder}/${baseName}.md` : `${baseName}.md`;
		const existing = this.app.vault.getAbstractFileByPath(filePath);

		if (existing && !(existing instanceof TFile)) {
			new Notice('A folder already uses that name.');
			return;
		}

		const templateOptions: HomebrewFileTemplateOptions = {};
		if (this.category === 'Spells') {
			templateOptions.spell = {
				level: this.spellLevel,
				classes: this.spellClasses,
				school: this.spellSchool,
			};
		} else if (this.category === 'Magic Items') {
			templateOptions.magicItem = {
				level: this.itemLevel,
				type: this.itemType,
				requiresAttunement: this.itemRequiresAttunement,
			};
		}
		const file = existing instanceof TFile
			? existing
			: await this.app.vault.create(filePath, getHomebrewFileTemplate(this.category, templateOptions));
		this.close();
		await this.app.workspace.getLeaf(false).openFile(file);
	}
}

export function registerHomebrewFileCommand(app: App, addCommand: (command: { id: string; name: string; callback: () => void }) => void): void {
	addCommand({
		id: 'create-homebrew-file',
		name: 'Create homebrew file',
		callback: () => new HomebrewFileModal(app).open(),
	});
}
