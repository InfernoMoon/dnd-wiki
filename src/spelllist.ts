/**
 * spellList.ts
 * Markdown code block processor for ```spellList blocks.
 * Parses directives (level, class, school), filters index pages,
 * and renders matching spells using `renderSingleSpell`.
 */
import { MarkdownPostProcessorContext, requestUrl } from "obsidian";
import { getBaseUrl } from "./dataService";
import { renderSingleSpell } from "./spellUtils";
import { nameToSlug, displayNameFromSlug } from "./utils";

/**
 * Render a filtered list of spells based on directives provided in the block.
 * Supports:
 * - level: all | 0..9 | ranges like 2-4
 * - class: comma-separated names or "all"
 * - school: comma-separated names or "all"
 * Fetches `/spells` and optional `/spells:<slug>` pages to intersect results.
 */
type LevelDirective = number | number[] | "all" | null;
type NamesDoc = Document | Element;

// In-memory cache: key is combination of filters, value is list of spell names
const spellListCache: Map<string, string[]> = new Map();

function buildCacheKey(levelDirective: LevelDirective, classSlugs?: string[], schoolSlugs?: string[]): string {
	const levelKey = Array.isArray(levelDirective)
		? `levels:${levelDirective.join(',')}`
		: typeof levelDirective === 'number'
		? `level:${levelDirective}`
		: levelDirective === 'all'
		? 'level:all'
		: 'level:null';
	const classKey = Array.isArray(classSlugs) && classSlugs.length ? `classes:${classSlugs.slice().sort().join(',')}` : 'classes:null';
	const schoolKey = Array.isArray(schoolSlugs) && schoolSlugs.length ? `schools:${schoolSlugs.slice().sort().join(',')}` : 'schools:null';
	return `${levelKey}|${classKey}|${schoolKey}`;
}

function parseDirectives(source: string): {
	levelDirective: LevelDirective;
	classDirective: string[] | "all" | null;
	schoolDirective: string[] | "all" | null;
	addSpells: string[]; // list of slugs to add (not a filter)
	removeSpells: string[]; // list of slugs to remove (post-add removal)
} {
	const lines = source.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
	let levelDirective: LevelDirective = null;
	let classDirective: string[] | "all" | null = null;
	let schoolDirective: string[] | "all" | null = null;
	const addSpells: string[] = [];
	const removeSpells: string[] = [];

	const expandLevels = (raw: string): number[] => {
		const out: number[] = [];
		const tokens = raw.split(",").map((s) => s.trim()).filter(Boolean);
		for (const tok of tokens) {
			if (/^\d+$/.test(tok)) {
				const n = Number.parseInt(tok, 10);
				if (!Number.isNaN(n) && n >= 0 && n <= 9) out.push(n);
			} else {
				const mm = /^(\d+)\s*-\s*(\d+)$/.exec(tok);
				if (mm) {
					const a = Number.parseInt(mm[1], 10);
					const b = Number.parseInt(mm[2], 10);
					if (!Number.isNaN(a) && !Number.isNaN(b)) {
						const start = Math.max(0, Math.min(a, b));
						const end = Math.min(9, Math.max(a, b));
						for (let i = start; i <= end; i++) out.push(i);
					}
				}
			}
		}
		return Array.from(new Set(out)).sort((x, y) => x - y);
	};

	for (const line of lines) {
		const mLevel = /^level:\s*(all|[\d\s,-]+)$/i.exec(line);
		if (mLevel) {
			const vraw = mLevel[1].toLowerCase();
			levelDirective = vraw.trim() === "all" ? "all" : ((): LevelDirective => {
				const parts = expandLevels(vraw);
				return parts.length <= 1 ? parts[0] ?? null : parts;
			})();
			continue;
		}
		const mClass = /^class:\s*(.+)$/i.exec(line);
		if (mClass) {
			const raw = mClass[1].trim();
			classDirective = /^all$/i.test(raw)
				? "all"
				: raw.split(",").map((s) => s.trim()).filter(Boolean).map((p) => nameToSlug(p)).filter(Boolean);
			continue;
		}
		const mSchool = /^school:\s*(.+)$/i.exec(line);
		if (mSchool) {
			const raw = mSchool[1].trim();
			schoolDirective = /^all$/i.test(raw)
				? "all"
				: raw.split(",").map((s) => s.trim()).filter(Boolean).map((p) => nameToSlug(p)).filter(Boolean);
			continue;
		}
		const mAdd = /^addspells:\s*(.+)$/i.exec(line);
		if (mAdd) {
			const raw = mAdd[1].trim();
			const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
			for (const p of parts) {
				const slug = nameToSlug(p);
				if (slug) addSpells.push(slug);
			}
			continue;
		}
		const mRemove = /^removespells:\s*(.+)$/i.exec(line);
		if (mRemove) {
			const raw = mRemove[1].trim();
			const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
			for (const p of parts) {
				const slug = nameToSlug(p);
				if (slug) removeSpells.push(slug);
			}
			continue;
		}
	}
	return { levelDirective, classDirective, schoolDirective, addSpells, removeSpells };
}

function extractNames(root: NamesDoc): string[] {
	const rows = Array.from(root.querySelectorAll("table tr"));
	return rows
		.map((tr) => tr.querySelector("td"))
		.filter((td) => td?.textContent?.trim().length)
		.map((td) => (td?.textContent || "").trim());
}

function toNames(docs: (Document | null)[]): string[][] {
	return docs.filter((d): d is Document => !!d).map((d) => extractNames(d));
}

function unionNormalized(listOfNameArrays: string[][]): Set<string> {
	const set = new Set<string>();
	for (const arr of listOfNameArrays) {
		for (const n of arr) set.add(nameToSlug(n));
	}
	return set;
}

async function fetchIndexAndFilters(baseUrl: string, classSlugs?: string[], schoolSlugs?: string[]) {
	const base = baseUrl.replace(/\/$/, "");
	const baseHtml = await requestUrl({ url: `${base}/spells`, method: "GET" });
	if (baseHtml.status < 200 || baseHtml.status >= 300) {
		return { baseDoc: null as Document | null, classDocs: [] as (Document | null)[], schoolDocs: [] as (Document | null)[] };
	}
	const parser = new DOMParser();
	const baseDoc = parser.parseFromString(baseHtml.text, "text/html");
	const fetchDocs = async (slugs?: string[]) => {
		if (!Array.isArray(slugs) || !slugs.length) return [] as (Document | null)[];
		return Promise.all(
			slugs.map(async (s) => {
				try {
					const h = await requestUrl({ url: `${base}/spells:${s}`, method: "GET" });
					if (h.status < 200 || h.status >= 300) return null;
					return parser.parseFromString(h.text, "text/html");
				} catch {
					return null;
				}
			})
		);
	};
	const classDocs = await fetchDocs(classSlugs);
	const schoolDocs = await fetchDocs(schoolSlugs);
	return { baseDoc, classDocs, schoolDocs };
}

function applyClassSchoolFilters(names: string[], classDocs: (Document | null)[], schoolDocs: (Document | null)[]): string[] {
	const classSet = classDocs.length ? unionNormalized(toNames(classDocs)) : null;
	const schoolSet = schoolDocs.length ? unionNormalized(toNames(schoolDocs)) : null;
	let filtered = names;
	if (classSet) filtered = filtered.filter((n) => classSet.has(nameToSlug(n)));
	if (schoolSet) filtered = filtered.filter((n) => schoolSet.has(nameToSlug(n)));
	return filtered;
}

function applyLevelFilters(baseDoc: Document, names: string[], spellLevel?: number, spellLevels?: number[]): { ok: boolean; names: string[]; message?: string } {
	if (Array.isArray(spellLevels) && spellLevels.length) {
		const unionLevelSet = new Set<string>();
		for (const lvl of spellLevels) {
			const tabEl = baseDoc.querySelector(`#wiki-tab-0-${lvl}`);
			if (!tabEl) continue;
			const levelNames = extractNames(tabEl);
			for (const n of levelNames) unionLevelSet.add(nameToSlug(n));
		}
		if (!unionLevelSet.size) {
			return { ok: false, names: [], message: `No Spells found for levels ${spellLevels.join(",")}` };
		}
		return { ok: true, names: names.filter((n) => unionLevelSet.has(nameToSlug(n))) };
	}
	if (typeof spellLevel === "number" && !Number.isNaN(spellLevel)) {
		const tabEl = baseDoc.querySelector(`#wiki-tab-0-${spellLevel}`);
		if (!tabEl) {
			return { ok: false, names: [], message: `No Spells found for level ${spellLevel}` };
		}
		const levelNames = extractNames(tabEl);
		const setLevel = new Set(levelNames.map((n) => nameToSlug(n)));
		return { ok: true, names: names.filter((n) => setLevel.has(nameToSlug(n))) };
	}
	return { ok: true, names };
}

function buildHeading(spellLevel: number | undefined, spellLevels: number[] | undefined, classSlugs?: string[], schoolSlugs?: string[]): string {
	const headingParts: string[] = [];
	if (Array.isArray(spellLevels) && spellLevels.length) headingParts.push(`Level ${spellLevels.join(", ")}`);
	else if (typeof spellLevel === "number" && !Number.isNaN(spellLevel)) headingParts.push(`Level ${spellLevel}`);
	if (Array.isArray(classSlugs) && classSlugs.length) headingParts.push(`Class ${classSlugs.map((s) => displayNameFromSlug(s)).join(", ")}`);
	if (Array.isArray(schoolSlugs) && schoolSlugs.length) headingParts.push(`School ${schoolSlugs.map((s) => displayNameFromSlug(s)).join(", ")}`);
	return headingParts.length ? `Spells ${headingParts.join(" · ")}` : "All Spells";
}

export async function renderSpellList(source: string, el: HTMLElement, _ctx?: MarkdownPostProcessorContext) {
	el.empty();
	const baseUrl = await getBaseUrl();
	if (!baseUrl) {
		el.createEl("div", { text: "Base URL is not configured." });
		return;
	}

	const { levelDirective, classDirective, schoolDirective, addSpells, removeSpells } = parseDirectives(source);
	const spellLevel = typeof levelDirective === "number" ? levelDirective : undefined;
	const classSlugs = Array.isArray(classDirective) ? classDirective : undefined;
	const schoolSlugs = Array.isArray(schoolDirective) ? schoolDirective : undefined;
	const spellLevels = Array.isArray(levelDirective) ? levelDirective : undefined;

	// Cache key for exact filter combination
	const cacheKey = buildCacheKey(levelDirective, classSlugs, schoolSlugs);
	let names = spellListCache.get(cacheKey);
	if (!names) {
		const { baseDoc, classDocs, schoolDocs } = await fetchIndexAndFilters(baseUrl, classSlugs, schoolSlugs);
		if (!baseDoc) {
			el.createEl("div", { text: "Failed to load spells index." });
			return;
		}
		let fetched = extractNames(baseDoc);
		fetched = applyClassSchoolFilters(fetched, classDocs, schoolDocs);
		const levelResult = applyLevelFilters(baseDoc, fetched, spellLevel, spellLevels);
		if (!levelResult.ok) {
			el.setText(levelResult.message || "No Spells found");
			return;
		}
		names = levelResult.names;
		spellListCache.set(cacheKey, names);
	}
	// Merge in explicit addSpells (avoid duplicates by slug)
	if (addSpells && addSpells.length) {
		const existingSlugs = new Set(names.map((n) => nameToSlug(n)));
		for (const slug of addSpells) {
			if (!existingSlugs.has(slug)) {
				names.push(slug);
			}
		}
		// Normalize names array to display names for any slugs added
		names = names.map((n) => {
			const s = nameToSlug(n);
			return s === n ? displayNameFromSlug(n) : n;
		});
	}
	// Apply removespells after add: remove any matching slugs
	if (removeSpells && removeSpells.length) {
		const removeSet = new Set(removeSpells);
		names = names.filter((n) => !removeSet.has(nameToSlug(n)));
	}
	if (!names.length) {
		el.setText("No Spell Names found");
		return;
	}

	const heading = buildHeading(spellLevel, spellLevels, classSlugs, schoolSlugs);
	const wrap = document.createElement("div");
	const h2 = document.createElement("h2");
	h2.style.margin = "0 0 0.5em 0";
	h2.textContent = heading;
	wrap.appendChild(h2);
	const container = document.createElement("div");
	wrap.appendChild(container);
	el.appendChild(wrap);

	const tasks = names.map(async (name) => {
		const host = document.createElement("div");
		host.style.marginBottom = "0.75em";
		container.appendChild(host);
		await renderSingleSpell(host, baseUrl, name);
	});
	await Promise.all(tasks);
}
