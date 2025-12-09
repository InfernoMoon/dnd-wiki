/**
 * prompts.ts
 * UI modals used by the plugin.
 *
 * Contains a simple modal to collect the Base URL from the user.
 */
import { App, Modal, Setting } from "obsidian";

/** Modal prompting the user for the data source Base URL */
export class BaseUrlPromptModal extends Modal {
	private readonly onSubmit: (value: string) => void;

	constructor(app: App, onSubmit: (value: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "Please enter the URL you want to get your DnD 5e data from" });
		let inputValue = "";

		new Setting(contentEl)
			.setName("URL")
			.addText((t) => {
				t.setPlaceholder("https://example.com");
				t.onChange((v) => (inputValue = v));
			});

		new Setting(contentEl)
			.addButton((b) => {
				b.setButtonText("Save").setCta().onClick(() => {
					this.close();
					this.onSubmit(inputValue);
				});
			})
			.addButton((b) => {
				b.setButtonText("Cancel").onClick(() => {
					this.close();
					this.onSubmit("");
				});
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
