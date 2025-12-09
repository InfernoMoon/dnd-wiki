import { MarkdownPostProcessorContext } from "obsidian";
import { getBaseUrl } from "./dataService";
import { renderSingleSpell } from "./spellUtils";

export async function renderSpell(source: string, el: HTMLElement, _ctx?: MarkdownPostProcessorContext) {
  el.empty();

  const lines = source
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) {
    el.createEl("div", { text: "No spell name provided." });
    return;
  }

  const baseUrl = await getBaseUrl();
  if (!baseUrl) {
    el.createEl("div", { text: "Base URL is not configured." });
    return;
  }

  // Container for multiple cards
  const containerId = `spell-multi-${Math.random().toString(36).slice(2, 11)}`;
  const container = document.createElement("div");
  container.id = containerId;
  el.appendChild(container);

  const tasks = lines.map(async (name) => {
    const host = document.createElement('div');
    host.style.marginBottom = '0.75em';
    container.appendChild(host);
    await renderSingleSpell(host, baseUrl, name);
  });
  await Promise.all(tasks);
}
