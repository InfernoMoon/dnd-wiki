const https = require("https");
// Shared HTTPS agent to reduce socket churn and limit concurrency
const HTTP_AGENT = new https.Agent({ keepAlive: true, maxSockets: 8 });
const { Plugin, EditorSuggest, EditorPosition, Modal, Setting, Notice } = require("obsidian");
const DATA_PATH = '.obsidian/plugins/dnd-5e-spell-cards/data';
let fs = null, path = null;
try {
    fs = window.require ? window.require('fs') : null;
    path = window.require ? window.require('path') : null;
} catch {}

module.exports = class SpellPlugin extends Plugin {
    onload() {
        console.log("Spell Plugin loaded");

        // Load base URL from JSON config
        this.baseUrl = "";
        // Directive options for spelllist suggester
        this.classNameOptions = [];
        this.schoolNameOptions = [];
        this.loadBaseUrl()
            .then(async () => {
                await this.loadDirectiveOptions();
                await this.preloadAllSpellNames();
            })
            .catch(err => {
                console.error("Base URL load failed", err);
                // Try loading directive options even if base URL failed
                this.loadDirectiveOptions().catch(e => console.error("Directive options load failed", e));
                this.preloadAllSpellNames().catch(e => console.error("Spell preload failed", e));
            });

        // In-memory cache for spell names
        this.spellNameCache = [];

        // Preload all spell names at startup (all classes, all levels) moved to run after base URL is loaded

        // Register editor suggestions for `spell` code blocks using cached names
        this.registerEditorSuggest(new SpellNameSuggest(this));

        // Register directive suggestions for `spelllist` code blocks
        this.registerEditorSuggest(new SpellListDirectiveSuggest(this));

        // Processor for entering spell names
        this.registerMarkdownCodeBlockProcessor("spell", async (source, el, ctx) => {
            try {
                const lines = source.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                const names = lines.length ? lines : [source.trim()];
                const ids = names
                    .map(n => this.normalizeId(n))
                    .filter(id => id && id.length > 0);

                if (!ids.length) {
                    el.setText("No spell name provided");
                    return;
                }

                // Render multiple spells in parallel
                const containerId = `spell-multi-${Math.random().toString(36).substr(2, 9)}`;
                el.innerHTML = `<div id="${containerId}"></div>`;
                const container = el.querySelector(`#${containerId}`);

                const tasks = ids.map((id, idx) => {
                    const host = document.createElement('div');
                    host.style.marginBottom = '0.75em';
                    container.appendChild(host);
                    return this.renderSpellCard(host, id).catch(e => {
                        const errorDiv = document.createElement('div');
                        errorDiv.textContent = `Failed to load spell: ${names[idx]}`;
                        container.appendChild(errorDiv);
                        console.error(e);
                    });
                });
                await Promise.all(tasks);

            } catch (err) {
                el.setText("Error fetching content!");
                console.error(err);
            }
        });

        // Processor for listing spells via filters (level/class/school);
        this.registerMarkdownCodeBlockProcessor("spelllist", async (source, el, ctx) => {
            try {
                const lines = source.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                let levelDirective = null; // number | number[] | 'all' | null
            let classDirective = null; // string[] | 'all' | null
            let schoolDirective = null; // string[] | 'all' | null

                for (const line of lines) {
                    const mLevel = /^level:\s*(all|[\d\s,\-]+)$/i.exec(line);
                    if (mLevel) {
                        const vraw = mLevel[1].toLowerCase();
                        if (vraw.trim() === 'all') {
                            levelDirective = 'all';
                        } else {
                            const expandLevels = (raw) => {
                                const out = [];
                                const tokens = raw.split(',').map(s => s.trim()).filter(Boolean);
                                for (const tok of tokens) {
                                    if (/^\d+$/.test(tok)) {
                                        const n = parseInt(tok, 10);
                                        if (!Number.isNaN(n) && n >= 0 && n <= 9) out.push(n);
                                    } else if (/^(\d+)\s*-\s*(\d+)$/.test(tok)) {
                                        const m = /^(\d+)\s*-\s*(\d+)$/.exec(tok);
                                        const a = parseInt(m[1], 10);
                                        const b = parseInt(m[2], 10);
                                        if (!Number.isNaN(a) && !Number.isNaN(b)) {
                                            const start = Math.max(0, Math.min(a, b));
                                            const end = Math.min(9, Math.max(a, b));
                                            for (let i = start; i <= end; i++) out.push(i);
                                        }
                                    }
                                }
                                // dedupe and sort
                                return Array.from(new Set(out)).sort((x, y) => x - y);
                            };
                            const parts = expandLevels(vraw);
                            // collapse single element to number for backward compatibility
                            levelDirective = parts.length <= 1 ? (parts[0] ?? null) : parts;
                        }
                        continue;
                    }
                    const mClass = /^class:\s*(.+)$/i.exec(line);
                    if (mClass) {
                        const raw = mClass[1].trim();
                        if (/^all$/i.test(raw)) {
                            classDirective = 'all';
                        } else {
                            const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
                            classDirective = parts.map(p => this.normalizeId(p)).filter(Boolean);
                        }
                        continue;
                    }
                    const mSchool = /^school:\s*(.+)$/i.exec(line);
                    if (mSchool) {
                        const raw = mSchool[1].trim();
                        if (/^all$/i.test(raw)) {
                            schoolDirective = 'all';
                        } else {
                            const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
                            schoolDirective = parts.map(p => this.normalizeId(p)).filter(Boolean);
                        }
                        continue;
                    }
                }

                const spellLevel = typeof levelDirective === 'number' ? levelDirective : undefined; // undefined when 'all' or array or not provided
                const classSlugs = Array.isArray(classDirective) ? classDirective : undefined;
                const schoolSlugs = Array.isArray(schoolDirective) ? schoolDirective : undefined;
                const spellLevels = Array.isArray(levelDirective) ? levelDirective : undefined;
                await this.renderSpellList(el, spellLevel, classSlugs, schoolSlugs, spellLevels);
            } catch (err) {
                el.setText("Error fetching spell list!");
                console.error(err);
            }
        });
    }
    async loadDirectiveOptions() {
        // Load class and school options from data/*.json
        const readJsonFromVault = async (relPath) => {
            if (this.app && this.app.vault && this.app.vault.adapter && this.app.vault.adapter.read) {
                try {
                    const txt = await this.app.vault.adapter.read(relPath);
                    return JSON.parse(txt || '[]');
                } catch {}
            }
            return null;
        };
        const classesPath = `${DATA_PATH}/classes.json`;
        const schoolsPath = `${DATA_PATH}/schools.json`;
        let classes = await readJsonFromVault(classesPath);
        let schools = await readJsonFromVault(schoolsPath);
        if (!classes && fs && path && typeof __dirname === 'string') {
            try {
                const p = path.join(__dirname, 'data', 'classes.json');
                classes = JSON.parse(fs.readFileSync(p, 'utf8') || '[]');
            } catch {}
        }
        if (!schools && fs && path && typeof __dirname === 'string') {
            try {
                const p = path.join(__dirname, 'data', 'schools.json');
                schools = JSON.parse(fs.readFileSync(p, 'utf8') || '[]');
            } catch {}
        }
        const extractNames = (arr) => {
            if (!Array.isArray(arr)) return [];
            return arr.map(x => {
                if (typeof x === 'string') return x;
                if (x && typeof x === 'object') {
                    // Prefer 'name', fallback to 'title' or 'label'
                    return x.name || x.title || x.label || '';
                }
                return '';
            }).filter(Boolean).sort((a, b) => a.localeCompare(b));
        };
        this.classNameOptions = extractNames(classes || []);
        this.schoolNameOptions = extractNames(schools || []);
    }
    async loadBaseUrl() {
        // Try reading from plugin directory via fs first
        const relVaultPath = `${DATA_PATH}/source.json`;
        // Desktop vault adapter read (works on Obsidian desktop)
        if (this.app && this.app.vault && this.app.vault.adapter && this.app.vault.adapter.read) {
            try {
                const jsonText = await this.app.vault.adapter.read(relVaultPath);
                const cfg = JSON.parse(jsonText || '{}');
                const configured = (cfg && typeof cfg.baseUrl === 'string') ? cfg.baseUrl : '';
                if (configured) {
                    this.baseUrl = configured.replace(/\/$/, "");
                    return;
                }
            } catch {}
        }
        // Fallback to fs with __dirname
        if (fs && path && typeof __dirname === 'string') {
            try {
                const p = path.join(__dirname, 'data', 'source.json');
                const jsonText = fs.readFileSync(p, 'utf8');
                const cfg = JSON.parse(jsonText || '{}');
                const configured = (cfg && typeof cfg.baseUrl === 'string') ? cfg.baseUrl : '';
                if (configured) {
                    this.baseUrl = configured.replace(/\/$/, "");
                    return;
                }
            } catch {}
        }
        // If still empty, prompt the user to enter a base URL and persist it
        const entered = await this.promptForBaseUrl();
        if (entered && typeof entered === 'string' && entered.trim().length) {
            const clean = entered.trim().replace(/\/$/, "");
            this.baseUrl = clean;
            try {
                const payload = JSON.stringify({ baseUrl: clean });
                if (this.app && this.app.vault && this.app.vault.adapter && this.app.vault.adapter.write) {
                    await this.app.vault.adapter.write(relVaultPath, payload);
                } else if (fs && path && typeof __dirname === 'string') {
                    const p = path.join(__dirname, 'data', 'source.json');
                    fs.writeFileSync(p, payload, 'utf8');
                }
                new Notice('Base URL saved.');
            } catch (e) {
                console.error('Failed to save base URL', e);
                new Notice('Failed to save base URL.');
            }
            return;
        }
        new Notice('No base URL configured. Plugin may not work.');
    }

    // Show a modal prompt to get base URL from the user
    promptForBaseUrl() {
        return new Promise((resolve) => {
            const modal = new BaseUrlPromptModal(this.app, (value) => resolve(value));
            modal.open();
        });
    }
    async preloadAllSpellNames() {
        try {
            const url = `${this.baseUrl}/spells`;
            const html = await this.getHtml(url);
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const rows = Array.from(doc.querySelectorAll('table tr'));
            const names = rows
                .map(tr => tr.querySelector('td'))
                .filter(td => td && td.textContent && td.textContent.trim().length > 0)
                .map(td => td.textContent.trim())
                .map(name => name.replace(/\(\s*ua\s*\)/ig, '').trim())
                .filter((n, i, arr) => n && arr.indexOf(n) === i)
                .sort((a, b) => a.localeCompare(b));
            this.spellNameCache = names;
            console.log(`Preloaded ${names.length} spell names`);
        } catch (e) {
            console.error(e);
        }
    }


    onunload() {
        console.log("Spell Plugin unloaded");
    }

    getHtml(url, attempt = 1) {
        return new Promise((resolve, reject) => {
            const fetchUrl = (currentUrl) => {
                const req = https.get(currentUrl, { agent: HTTP_AGENT }, (res) => {
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        fetchUrl(res.headers.location);
                        return;
                    }
                    let data = "";
                    res.on("data", chunk => data += chunk);
                    res.on("end", () => resolve(data));
                });
                req.on("error", (err) => {
                    // Retry a couple of times on transient network errors
                    if (attempt < 3 && (err.code === 'ECONNRESET' || err.code === 'EAI_AGAIN' || err.code === 'ETIMEDOUT')) {
                        const backoff = 150 * attempt;
                        setTimeout(() => {
                            this.getHtml(url, attempt + 1).then(resolve).catch(reject);
                        }, backoff);
                    } else {
                        reject(err);
                    }
                });
            };
            fetchUrl(url);
        });
    }

    normalizeId(name) {
        if (!name) return "";
        // Remove "(UA)" markers from spell names
        let id = name.replace(/\(\s*ua\s*\)/ig, "").trim().toLowerCase();
        // Convert slashes to dashes instead of removing them
        id = id.replace(/\//g, "-");
        id = id.replace(/\s+/g, "-");
        id = id.replace(/[^a-z0-9-]/g, "");
        id = id.replace(/-+/g, "-");
        id = id.replace(/^-+|-+$/g, "");
        return id;
    }

    displayNameFromSlug(slug) {
        if (!slug) return "";
        // Replace dashes with spaces and capitalize each word's first letter
        return slug
            .split('-')
            .filter(Boolean)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }

    async renderSpellCard(el, id) {
        if (!id) {
            el.setText("No spell name provided");
            return;
        }

        const tryFetch = async (spellId) => {
            const url = `${this.baseUrl}/spell:${spellId}`;
            const html = await this.getHtml(url);
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const titleEl = doc.querySelector('.page-title.page-header');
            const contentEl = doc.querySelector('#page-content');
            return { doc, titleEl, contentEl };
        };

        let currentId = id;
        let { doc, titleEl, contentEl } = await tryFetch(currentId);
        const titleText = titleEl ? (titleEl.textContent || '') : '';
        // If page indicates missing, attempt with '-ua' suffix once
        if (titleText.toLowerCase().includes('the page does not')) {
            currentId = `${id}-ua`;
            ({ doc, titleEl, contentEl } = await tryFetch(currentId));
        }

        const finalTitleText = titleEl ? (titleEl.textContent || '') : '';
        const failed = !titleEl || !contentEl || finalTitleText.toLowerCase().includes('the page does not');
        if (failed) {
            const display = this.displayNameFromSlug(id);
            const contentDivId = `spell-content-${Math.random().toString(36).substr(2, 9)}`;
            const arrowId = `spell-arrow-${Math.random().toString(36).substr(2, 9)}`;
            el.innerHTML = `
                <div style="display:flex; align-items:center; cursor:pointer;" id="title-${contentDivId}">
                    <span style="margin-right:0.5em;" id="${arrowId}">▼</span>
                    <span style="font-size: 1.1em; font-weight: 600; margin:0;">${display} (Error)</span>
                </div>
                <div id="${contentDivId}" style="display:none; margin-top:0.5em;">Error loading this spell</div>
            `;
            const titleDiv = el.querySelector(`#title-${contentDivId}`);
            const contentDiv = el.querySelector(`#${contentDivId}`);
            const arrow = el.querySelector(`#${arrowId}`);
            titleDiv.addEventListener("click", () => {
                if (contentDiv.style.display === "none") {
                    contentDiv.style.display = "block";
                    arrow.textContent = "▲";
                } else {
                    contentDiv.style.display = "none";
                    arrow.textContent = "▼";
                }
            });
            return;
        }

        // Remove all outbound links: replace <a> elements with their visible text
        const contentClone = contentEl.cloneNode(true);
        contentClone.querySelectorAll('a').forEach(a => {
            const text = a.textContent || '';
            const span = doc.createElement('span');
            span.textContent = text;
            a.replaceWith(span);
        });

        const contentDivId = `spell-content-${Math.random().toString(36).substr(2, 9)}`;
        const arrowId = `spell-arrow-${Math.random().toString(36).substr(2, 9)}`;

        el.innerHTML = `
            <div style="display:flex; align-items:center; cursor:pointer;" id="title-${contentDivId}">
                <span style="margin-right:0.5em;" id="${arrowId}">▼</span>
                <span style="font-size: 1.1em; font-weight: 600; margin:0;">${titleEl.textContent}</span>
            </div>
            <div id="${contentDivId}" style="display:none; margin-top:0.5em;">${contentClone.innerHTML}</div>
        `;

        const titleDiv = el.querySelector(`#title-${contentDivId}`);
        const contentDiv = el.querySelector(`#${contentDivId}`);
        const arrow = el.querySelector(`#${arrowId}`);

        titleDiv.addEventListener("click", () => {
            if (contentDiv.style.display === "none") {
                contentDiv.style.display = "block";
                arrow.textContent = "▲";
            } else {
                contentDiv.style.display = "none";
                arrow.textContent = "▼";
            }
        });
    }

    async renderSpellList(el, spellLevel, classSlugs, schoolSlugs, spellLevels) {
        // Helper to extract names from a doc (optionally within a scope element)
        const extractNames = (root) => {
            const rows = Array.from(root.querySelectorAll('table tr'));
            return rows
                .map(tr => tr.querySelector('td'))
                .filter(td => td && td.textContent && td.textContent.trim().length > 0)
                .map(td => td.textContent.trim());
        };

        // Fetch base, class, and school pages as needed
        const baseUrl = `${this.baseUrl}/spells`;
        const [baseHtml] = await Promise.all([
            this.getHtml(baseUrl)
        ]);

        const parser = new DOMParser();
        const baseDoc = parser.parseFromString(baseHtml, 'text/html');
        // Fetch multiple class/school pages if provided
        const classDocs = Array.isArray(classSlugs) && classSlugs.length
            ? await Promise.all(classSlugs.map(s => this.getHtml(`${this.baseUrl}/spells:${s}`)
                .then(h => parser.parseFromString(h, 'text/html'))
                .catch(() => null)))
            : [];
        const schoolDocs = Array.isArray(schoolSlugs) && schoolSlugs.length
            ? await Promise.all(schoolSlugs.map(s => this.getHtml(`${this.baseUrl}/spells:${s}`)
                .then(h => parser.parseFromString(h, 'text/html'))
                .catch(() => null)))
            : [];

        // If a spell level is provided, scope to the corresponding tab container
        // Determine names according to filters
        let names = [];
        const unionNormalized = (listOfNameArrays) => {
            const set = new Set();
            for (const arr of listOfNameArrays) {
                for (const n of arr) set.add(this.normalizeId(n));
            }
            return set;
        };
        const toNames = (docs) => docs.filter(Boolean).map(d => extractNames(d));
        const classSet = classDocs.length ? unionNormalized(toNames(classDocs)) : null;
        const schoolSet = schoolDocs.length ? unionNormalized(toNames(schoolDocs)) : null;
        // Start from base names; if filters provided, intersect with them
        names = extractNames(baseDoc);
        if (classSet) {
            names = names.filter(n => classSet.has(this.normalizeId(n)));
        }
        if (schoolSet) {
            names = names.filter(n => schoolSet.has(this.normalizeId(n)));
        }

        // If a spell level filter is provided, intersect with level tab from base (or relevant doc if only one provided)
        if (Array.isArray(spellLevels) && spellLevels.length) {
            const levelRoot = baseDoc;
            const unionLevelSet = new Set();
            for (const lvl of spellLevels) {
                const tabEl = levelRoot.querySelector(`#wiki-tab-0-${lvl}`);
                if (!tabEl) continue;
                const levelNames = extractNames(tabEl);
                for (const n of levelNames) unionLevelSet.add(this.normalizeId(n));
            }
            if (!unionLevelSet.size) {
                el.setText(`No Spells found for levels ${spellLevels.join(',')}`);
                return;
            }
            names = names.filter(n => unionLevelSet.has(this.normalizeId(n)));
        } else if (typeof spellLevel === 'number' && !Number.isNaN(spellLevel)) {
            const levelRoot = baseDoc; // level tabs exist on base page
            const tabEl = levelRoot.querySelector(`#wiki-tab-0-${spellLevel}`);
            if (!tabEl) {
                el.setText(`No Spells found for level ${spellLevel}`);
                return;
            }
            const levelNames = extractNames(tabEl);
            const setLevel = new Set(levelNames.map(n => this.normalizeId(n)));
            names = names.filter(n => setLevel.has(this.normalizeId(n)));
        }

        // Spells page typically contains tables of spells
        if (!names.length) {
            el.setText('No Spell Names found');
            return;
        }

        // Instead of listing names, render each as a spell card
        const containerId = `spell-list-${Math.random().toString(36).substr(2, 9)}`;
        const headingParts = [];
        if (Array.isArray(spellLevels) && spellLevels.length) headingParts.push(`Level ${spellLevels.join(', ')}`);
        else if (typeof spellLevel === 'number' && !Number.isNaN(spellLevel)) headingParts.push(`Level ${spellLevel}`);
        if (Array.isArray(classSlugs) && classSlugs.length) headingParts.push(`Class ${classSlugs.map(s => this.displayNameFromSlug(s)).join(', ')}`);
        if (Array.isArray(schoolSlugs) && schoolSlugs.length) headingParts.push(`School ${schoolSlugs.map(s => this.displayNameFromSlug(s)).join(', ')}`);
        const heading = headingParts.length ? `Spells ${headingParts.join(' · ')}` : 'All Spells';
        el.innerHTML = `<div>
            <h2 style="margin:0 0 0.5em 0;">${heading}</h2>
            <div id="${containerId}"></div>
        </div>`;

        const container = el.querySelector(`#${containerId}`);

        // Render each found item as an individual spell card in parallel
        // Concurrency limit to avoid overwhelming the server / sockets
        const concurrency = 16;
        let index = 0;
        const runNext = async () => {
            if (index >= names.length) return;
            const i = index++;
            const name = names[i];
            const id = this.normalizeId(name);
            const cardHost = document.createElement('div');
            cardHost.style.marginBottom = '0.75em';
            container.appendChild(cardHost);
            try {
                await this.renderSpellCard(cardHost, id);
            } catch (e) {
                const errorDiv = document.createElement('div');
                errorDiv.textContent = `Failed to load spell: ${name}`;
                container.appendChild(errorDiv);
                console.error(e);
            }
            await runNext();
        };
        const workers = Array(Math.min(concurrency, names.length)).fill(0).map(() => runNext());
        await Promise.all(workers);
    }
};

// Simple modal to ask for base URL input
class BaseUrlPromptModal extends Modal {
    constructor(app, onSubmit) {
        super(app);
        this.onSubmit = onSubmit;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: 'Please enter the URL you want to get your DnD 5e data from' });
        let inputValue = '';
        new Setting(contentEl)
            .setName('URL')
            .addText(t => {
                t.setPlaceholder('https://example.com');
                t.onChange(v => inputValue = v);
            });
        new Setting(contentEl)
            .addButton(b => {
                b.setButtonText('Save')
                 .setCta()
                 .onClick(() => { this.close(); this.onSubmit(inputValue); });
            })
            .addButton(b => {
                b.setButtonText('Cancel')
                 .onClick(() => { this.close(); this.onSubmit(''); });
            });
    }
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Editor suggester for spell names inside ```spell code blocks
class SpellNameSuggest extends EditorSuggest {
    constructor(plugin) {
        super(plugin.app);
        this.plugin = plugin;
    }

    // Determine when to show suggestions
    onTrigger(cursor, editor, file) {
        try {
            const line = editor.getLine(cursor.line);
            // Do not show suggestions on code fence lines
            if (line.trim().startsWith('```')) return null;
            // Detect we are inside a spell code block by scanning upward for ```spell
            let inSpellBlock = false;
            for (let i = cursor.line; i >= Math.max(0, cursor.line - 30); i--) {
                const l = editor.getLine(i).trim();
                if (l.startsWith('```')) {
                    inSpellBlock = /^```\s*spell\s*$/i.test(l);
                    break;
                }
            }
            if (!inSpellBlock) return null;

            // Current token to match: the word fragment before the cursor
            const prefixMatch = /([A-Za-z][A-Za-z\-\s']*)$/.exec(line.slice(0, cursor.ch));
            const query = prefixMatch ? prefixMatch[1].trim() : '';
            if (!query) return null;

            return {
                start: { line: cursor.line, ch: cursor.ch - query.length },
                end: cursor,
                query,
            };
        } catch {
            return null;
        }
    }

    // Provide suggestions based on cached names
    getSuggestions(context) {
        const q = context.query.toLowerCase();
        const names = this.plugin.spellNameCache || [];
        const results = names.filter(n => n.toLowerCase().includes(q)).slice(0, 50);
        return results.map(n => ({ name: n }));
    }

    renderSuggestion(item, el) {
        el.textContent = item.name;
    }

    // Apply the selected suggestion into the editor
    selectSuggestion(item, evt) {
        if (!this.context) return;
        const { editor, start, end } = this.context;
        if (!editor) return;
        editor.replaceRange(item.name, start, end);
        // Close the suggester until user types again
        try { this.close(); } catch {}
    }
}

// Editor suggester for directives inside ```spelllist code blocks
class SpellListDirectiveSuggest extends EditorSuggest {
    constructor(plugin) {
        super(plugin.app);
        this.plugin = plugin;
        this.directives = ["level:", "class:", "school:"];
    }

    onTrigger(cursor, editor, file) {
        try {
            const lineText = editor.getLine(cursor.line);
            // Do not show suggestions on code fence lines
            if (lineText.trim().startsWith('```')) return null;
            // Only in spelllist blocks
            let inBlock = false;
            for (let i = cursor.line; i >= Math.max(0, cursor.line - 30); i--) {
                const l = editor.getLine(i).trim();
                if (l.startsWith('```')) {
                    inBlock = /^```\s*spelllist\s*$/i.test(l);
                    break;
                }
            }
            if (!inBlock) return null;

            // Determine context: directive keyword or value after colon
            const uptoCursor = lineText.slice(0, cursor.ch);
            const colonIdx = uptoCursor.indexOf(':');
            if (colonIdx === -1) {
                // Suggest directive keywords
                const fragment = uptoCursor.trim();
                return {
                    start: { line: cursor.line, ch: 0 },
                    end: { line: cursor.line, ch: cursor.ch },
                    query: fragment,
                };
            } else {
                // Suggest values for specific directive
                const key = uptoCursor.slice(0, colonIdx).trim().toLowerCase();
                let valueFragment = uptoCursor.slice(colonIdx + 1).trim();
                // For comma-separated lists, operate on the last fragment
                const parts = valueFragment.split(',');
                const lastFrag = parts[parts.length - 1].trim();
                // Start position right after colon + any spaces
                const afterColonCh = (() => {
                    let ch = colonIdx + 1;
                    while (ch < uptoCursor.length && /\s/.test(uptoCursor[ch])) ch++;
                    // Move start to the beginning of the last fragment in comma-separated lists
                    const uptoCursorValue = uptoCursor.slice(ch);
                    const lastCommaIdx = uptoCursorValue.lastIndexOf(',');
                    if (lastCommaIdx !== -1) {
                        ch += lastCommaIdx + 1;
                        while (ch < uptoCursor.length && /\s/.test(uptoCursor[ch])) ch++;
                    }
                    return ch;
                })();
                return {
                    start: { line: cursor.line, ch: afterColonCh },
                    end: { line: cursor.line, ch: cursor.ch },
                    query: `${key}|${lastFrag}`,
                };
            }
        } catch {
            return null;
        }
    }

    getSuggestions(context) {
        const q = (context.query || '').toLowerCase();
        // If querying for directive keyword
        if (!q.includes('|')) {
            return this.directives
                .filter(d => d.startsWith(q) || q.length === 0)
                .map(d => ({ text: d }));
        }
        // Value suggestion mode
        const [key, valFrag] = q.split('|');
        if (key === 'class') {
            const options = this.plugin.classNameOptions || [];
            return options
                .filter(n => n.toLowerCase().includes(valFrag))
                .slice(0, 50)
                .map(n => ({ text: n }));
        }
        if (key === 'school') {
            const options = this.plugin.schoolNameOptions || [];
            return options
                .filter(n => n.toLowerCase().includes(valFrag))
                .slice(0, 50)
                .map(n => ({ text: n }));
        }
        if (key === 'level') {
            // Provide level numbers 0-9 or 'all'
            const levels = ['all', '0','1','2','3','4','5','6','7','8','9'];
            return levels
                .filter(n => n.startsWith(valFrag))
                .map(n => ({ text: n }));
        }
        return [];
    }

    renderSuggestion(item, el) {
        el.textContent = item.text;
    }

    selectSuggestion(item, evt) {
        if (!this.context) return;
        const { editor, start, end } = this.context;
        if (!editor) return;
        editor.replaceRange(item.text, start, end);
        try { this.close(); } catch {}
    }
}
