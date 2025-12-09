import { App, Notice, Plugin, TFile } from "obsidian";
import manifest from "../manifest.json";
import { BaseUrlPromptModal } from "./prompts";
declare const app: App;

interface PluginSettingsJson {
  baseurl?: string;
}

async function ensureFolder(folderPath: string) {
  const adapter = app.vault.adapter;
  const exists = await adapter.exists(folderPath);
  if (!exists) {
    await adapter.mkdir(folderPath);
  }
}

async function readJson<T>(file: string): Promise<T | null> {
  const adapter = app.vault.adapter;
  const exists = await adapter.exists(file);
  if (!exists) return null;
  try {
    const raw = await adapter.read(file);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(file: string, data: unknown) {
  const adapter = app.vault.adapter;
  await adapter.write(file, JSON.stringify(data, null, 2));
}

let cachedBaseUrl: string | undefined;
let pluginId = (manifest as { id: string }).id;
export function configurePluginId(id: string) {
  pluginId = id || pluginId;
}
function getDataFolder() {
  return `${pluginId}`;
}
function getSettingsPath() {
  return `${getDataFolder()}/settings.json`;
}

export function initBaseUrlWatcher(plugin: Plugin) {
  // Keep cached value in sync if settings.json changes or is deleted
  plugin.registerEvent(
    app.vault.on("modify", async (file: TFile) => {
      const settingsPath = getSettingsPath();
      if (file.path === settingsPath) {
        const current = (await readJson<PluginSettingsJson>(settingsPath)) ?? {};
        cachedBaseUrl = current.baseurl || undefined;
      }
    })
  );
  plugin.registerEvent(
    app.vault.on("delete", async (file) => {
      const settingsPath = getSettingsPath();
      if ((file as TFile).path === settingsPath) {
        cachedBaseUrl = undefined;
      }
    })
  );
}

export async function getBaseUrl(): Promise<string | null> {
  if (typeof cachedBaseUrl === "string") {
    return cachedBaseUrl;
  }
  const dataFolder = getDataFolder();
  const settingsPath = getSettingsPath();
  await ensureFolder(dataFolder);

  const current = (await readJson<PluginSettingsJson>(settingsPath)) ?? {};
  if (current.baseurl) {
    await writeJson(settingsPath, current); // ensure file exists
    cachedBaseUrl = current.baseurl;
    return cachedBaseUrl;
  }

  return await new Promise<string | null>((resolve) => {
    new BaseUrlPromptModal(app, async (value: string) => {
      if (!value) {
        const n = new Notice("DnD 5e Cards: No URL provided; plugin may not work.");
        (globalThis as unknown as { __dnd5eCardsNotices?: unknown[] }).__dnd5eCardsNotices =
          (globalThis as unknown as { __dnd5eCardsNotices?: unknown[] }).__dnd5eCardsNotices || [];
        (globalThis as unknown as { __dnd5eCardsNotices: unknown[] }).__dnd5eCardsNotices.push(n);
        resolve(null);
        return;
      }
      const updated: PluginSettingsJson = { ...current, baseurl: value };
      await writeJson(settingsPath, updated);
      const n2 = new Notice("DnD 5e Cards: Base URL saved.");
      (globalThis as unknown as { __dnd5eCardsNotices?: unknown[] }).__dnd5eCardsNotices =
        (globalThis as unknown as { __dnd5eCardsNotices?: unknown[] }).__dnd5eCardsNotices || [];
      (globalThis as unknown as { __dnd5eCardsNotices: unknown[] }).__dnd5eCardsNotices.push(n2);
      cachedBaseUrl = value;
      resolve(cachedBaseUrl);
    }).open();
  });
}
