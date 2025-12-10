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
export async function renderSpellList(
	source: string,
	el: HTMLElement,
	_ctx?: MarkdownPostProcessorContext
) {
	el.empty();

	const baseUrl = await getBaseUrl();
	if (!baseUrl) {
		el.createEl("div", { text: "Base URL is not configured." });
		return;
	}

	// Parse directives: class, school, level
	const lines = source
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	let levelDirective: number | number[] | "all" | null = null;
	let classDirective: string[] | "all" | null = null;
	let schoolDirective: string[] | "all" | null = null;

	for (const line of lines) {
		const mLevel = /^level:\s*(all|[\d\s,-]+)$/i.exec(line);
		if (mLevel) {
			const vraw = mLevel[1].toLowerCase();
			if (vraw.trim() === "all") {
				levelDirective = "all";
			} else {
				const expandLevels = (raw: string): number[] => {
					const out: number[] = [];
					const tokens = raw
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean);
					for (const tok of tokens) {
						if (/^\d+$/.test(tok)) {
							const n = Number.parseInt(tok, 10);
							if (!Number.isNaN(n) && n >= 0 && n <= 9)
								out.push(n);
						} else if (/^(\d+)\s*-\s*(\d+)$/.test(tok)) {
							const mm = /^(\d+)\s*-\s*(\d+)$/.exec(tok);
							if (mm) {
								const a = Number.parseInt(mm[1], 10);
								const b = Number.parseInt(mm[2], 10);
								if (!Number.isNaN(a) && !Number.isNaN(b)) {
									const start = Math.max(0, Math.min(a, b));
									const end = Math.min(9, Math.max(a, b));
									for (let i = start; i <= end; i++)
										out.push(i);
								}
							}
						}
					}
					return Array.from(new Set(out)).sort((x, y) => x - y);
				};
				const parts = expandLevels(vraw);
				levelDirective = parts.length <= 1 ? parts[0] ?? null : parts;
			}
			continue;
		}
		const mClass = /^class:\s*(.+)$/i.exec(line);
		if (mClass) {
			const raw = mClass[1].trim();
			if (/^all$/i.test(raw)) {
				classDirective = "all";
			} else {
				const parts = raw
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean);
				classDirective = parts
					.map((p) => nameToSlug(p))
					.filter(Boolean);
			}
			continue;
		}
		const mSchool = /^school:\s*(.+)$/i.exec(line);
		if (mSchool) {
			const raw = mSchool[1].trim();
			if (/^all$/i.test(raw)) {
				schoolDirective = "all";
			} else {
				const parts = raw
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean);
				schoolDirective = parts
					.map((p) => nameToSlug(p))
					.filter(Boolean);
			}
			continue;
		}
	}

	// Filters
	const spellLevel =
		typeof levelDirective === "number" ? levelDirective : undefined;
	const classSlugs = Array.isArray(classDirective)
		? classDirective
		: undefined;
	const schoolSlugs = Array.isArray(schoolDirective)
		? schoolDirective
		: undefined;
	const spellLevels = Array.isArray(levelDirective)
		? levelDirective
		: undefined;

	// Fetch base spells index and optionally class/school pages
	const base = baseUrl.replace(/\/$/, "");
	const baseHtml = await requestUrl({ url: `${base}/spells`, method: "GET" });
	if (baseHtml.status < 200 || baseHtml.status >= 300) {
		el.createEl("div", { text: "Failed to load spells index." });
		return;
	}
	const parser = new DOMParser();
	const baseDoc = parser.parseFromString(baseHtml.text, "text/html");
	const extractNames = (root: Document | Element) => {
		const rows = Array.from(root.querySelectorAll("table tr"));
		return rows
			.map((tr) => tr.querySelector("td"))
			.filter((td) => td?.textContent?.trim().length)
			.map((td) => (td?.textContent || "").trim());
	};
	const toNames = (docs: (Document | null)[]) =>
		docs.filter((d): d is Document => !!d).map((d) => extractNames(d));
	const unionNormalized = (listOfNameArrays: string[][]) => {
		const set = new Set<string>();
		for (const arr of listOfNameArrays) {
			for (const n of arr) set.add(nameToSlug(n));
		}
		return set;
	};

	const classDocs =
		Array.isArray(classSlugs) && classSlugs.length
			? await Promise.all(
				classSlugs.map(async (s) => {
					try {
						const h = await requestUrl({
							url: `${base}/spells:${s}`,
							method: "GET",
						});
						if (h.status < 200 || h.status >= 300) return null;
						return parser.parseFromString(h.text, "text/html");
					} catch {
						return null;
					}
				})
			)
			: [];

	const schoolDocs =
		Array.isArray(schoolSlugs) && schoolSlugs.length
			? await Promise.all(
				schoolSlugs.map(async (s) => {
					try {
						const h = await requestUrl({
							url: `${base}/spells:${s}`,
							method: "GET",
						});
						if (h.status < 200 || h.status >= 300) return null;
						return parser.parseFromString(h.text, "text/html");
					} catch {
						return null;
					}
				})
			)
			: [];

	let names = extractNames(baseDoc);
	const classSet = classDocs.length
		? unionNormalized(toNames(classDocs))
		: null;
	const schoolSet = schoolDocs.length
		? unionNormalized(toNames(schoolDocs))
		: null;
	if (classSet) {
		names = names.filter((n) => classSet.has(nameToSlug(n)));
	}
	if (schoolSet) {
		names = names.filter((n) => schoolSet.has(nameToSlug(n)));
	}

	// Level filtering using level tabs on base index
	if (Array.isArray(spellLevels) && spellLevels.length) {
		const unionLevelSet = new Set<string>();
		for (const lvl of spellLevels) {
			const tabEl = baseDoc.querySelector(`#wiki-tab-0-${lvl}`);
			if (!tabEl) continue;
			const levelNames = extractNames(tabEl);
			for (const n of levelNames) unionLevelSet.add(nameToSlug(n));
		}
		if (!unionLevelSet.size) {
			el.setText(`No Spells found for levels ${spellLevels.join(",")}`);
			return;
		}
		names = names.filter((n) => unionLevelSet.has(nameToSlug(n)));
	} else if (typeof spellLevel === "number" && !Number.isNaN(spellLevel)) {
		const tabEl = baseDoc.querySelector(`#wiki-tab-0-${spellLevel}`);
		if (!tabEl) {
			el.setText(`No Spells found for level ${spellLevel}`);
			return;
		}
		const levelNames = extractNames(tabEl);
		const setLevel = new Set(levelNames.map((n) => nameToSlug(n)));
		names = names.filter((n) => setLevel.has(nameToSlug(n)));
	}

	if (!names.length) {
		el.setText("No Spell Names found");
		return;
	}

	const headingParts: string[] = [];
	if (Array.isArray(spellLevels) && spellLevels.length)
		headingParts.push(`Level ${spellLevels.join(", ")}`);
	else if (typeof spellLevel === "number" && !Number.isNaN(spellLevel))
		headingParts.push(`Level ${spellLevel}`);
	if (Array.isArray(classSlugs) && classSlugs.length)
		headingParts.push(
			`Class ${classSlugs.map((s) => displayNameFromSlug(s)).join(", ")}`
		);
	if (Array.isArray(schoolSlugs) && schoolSlugs.length)
		headingParts.push(
			`School ${schoolSlugs
				.map((s) => displayNameFromSlug(s))
				.join(", ")}`
		);
	const heading = headingParts.length
		? `Spells ${headingParts.join(" · ")}`
		: "All Spells";
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
