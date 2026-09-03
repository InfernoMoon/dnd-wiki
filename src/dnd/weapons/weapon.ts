import type { MarkdownPostProcessorContext } from 'obsidian';
import { findWeaponEntry, getWeaponIndex, groupWeaponTableRows } from './weaponService';
import { prepareNameInput, renderNoResultsMessage, renderTable } from '../../utils/renderer';
import { displayNameFromSlug, getPrimarySlug } from '../../utils/text';

export async function renderWeapon(
	source: string,
	el: HTMLElement,
	_ctx: MarkdownPostProcessorContext | undefined,
	urlKey: string,
	baseUrl: string,
): Promise<void> {
	const names = prepareNameInput(el, source, baseUrl, 'Provide one or more weapon names.');
	if (!names) return;

	const index = await getWeaponIndex(urlKey, baseUrl, 'all');
	const entries: NonNullable<ReturnType<typeof findWeaponEntry>>[] = [];
	const missingNames: string[] = [];
	for (const name of names) {
		const entry = findWeaponEntry(index, name);
		if (entry) entries.push(entry);
		else missingNames.push(name);
	}

	const container = el.createDiv();
	const tableGroups = groupWeaponTableRows(entries);
	for (const group of tableGroups) {
		renderTable(container, group.headers, group.rows);
	}
	for (const name of missingNames) {
		container.createDiv({
			text: `Failed to load weapon: ${displayNameFromSlug(getPrimarySlug(name))}`,
		});
	}

	if (!tableGroups.length) renderNoResultsMessage(container, 'weapons');
}
