import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import { getHomebrewSettings } from '../dataService';
import { ensureHomebrewFolderPath } from './homebrew';
import { ensureHomebrewCategoryFolder, getHomebrewFileTemplate, HOMEBREW_CATEGORIES } from './homebrewTemplates';

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

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		new Setting(contentEl)
			.setName('Create homebrew file')
			.setHeading();

		new Setting(contentEl)
			.setName('Category')
			.addDropdown((dropdown) => {
				for (const category of HOMEBREW_CATEGORIES) {
					dropdown.addOption(category, CATEGORY_LABELS[category] ?? category);
				}
				dropdown.setValue(this.category).onChange((value) => {
					this.category = value;
				});
			});

		new Setting(contentEl)
			.setName('File name')
			.addText((text) => {
				text.setPlaceholder('e.g., Fireball')
					.onChange((value) => { this.fileName = value; });
			});

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

		const file = existing instanceof TFile
			? existing
			: await this.app.vault.create(filePath, getHomebrewFileTemplate(this.category));
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
