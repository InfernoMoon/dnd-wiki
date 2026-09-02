/**
 * genericLoader.ts
 * Generic data loader utility for scraping D&D wiki-style data.
 * Supports both legacy link-based and 2024+ table-based parsing methods.
 * Highly customizable with parameters for different data types.
 */
import { requestUrl } from 'obsidian';
import { nameToSlugs } from './utils/text';

export interface LoaderConfig {
  /** Base URL to fetch from */
  baseUrl: string;
  
  /** Path to index page for table parsing (e.g., "/feats", "/spells") */
  indexPath: string;
  
  /** Regex pattern to match in href attributes. Must have one capture group. (e.g., /^\/feat:([^\s"'>]+)$/i). Required when useLinkMethod is true. */
  linkPattern?: RegExp;
  
  /** CSS selector for table rows (default: "table tr") */
  tableRowSelector?: string;
  
  /** CSS selector for cell containing the name within a row (default: "td") */
  tableCellSelector?: string;
  
  /** Custom filter function to exclude entries. Return true to keep, false to exclude. */
  filterFn?: (name: string) => boolean;
  
  /** Use link-based parsing method (scrapes href attributes) (default: true) */
  useLinkMethod?: boolean;
  
  /** Use table-based parsing method (scrapes structured tables) (default: true) */
  useTableMethod?: boolean;
  
  /** Replace patterns. Array of [search, replace] tuples to clean up names (e.g., [['(ua)', ''], ['(UA)', '']]) */
  replacePatterns?: Array<[string, string]>;
  
  /** Whether baseUrl contains "2024" to auto-select method (default: auto-detect from baseUrl) */
  is2024Format?: boolean;

  /** Optional callback invoked for each table row after name extraction and filtering. Receives the row element and the extracted (cleaned) name. */
  rowProcessor?: (row: Element, name: string) => void;
}

/**
 * Load data using link-based parsing.
 * Fetches root page and extracts anchor tags with href attributes matching the provided pattern.
 * Use this for wikis that list data as links throughout the page.
 * @param config Loader configuration
 * @returns Set of normalized IDs found
 */
export async function loadFromLinks(config: LoaderConfig): Promise<Set<string>> {
  const results = new Set<string>();
  const base = config.baseUrl.replace(/\/$/, '');
  
  try {
    const res = await requestUrl({ url: `${base}/`, method: 'GET' });
    if (res.status < 200 || res.status >= 300) return results;
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(res.text, 'text/html');
    const anchors = Array.from(doc.querySelectorAll('a[href]'));
    
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      if (!config.linkPattern) continue;
      const m = config.linkPattern.exec(href);
      if (m && m[1]) {
        const name = m[1];
        
        // Apply custom filter
        if (config.filterFn && !config.filterFn(name)) continue;
        
        for (const id of nameToSlugs(name)) results.add(id);
      }
    }
  } catch (e) {
    console.warn(`Failed to load data via link-based method from ${base}`, e);
  }
  
  return results;
}

/**
 * Load data using table-based parsing.
 * Fetches index page and parses structured table data.
 * Use this for wikis that organize data in tables on dedicated index pages.
 * @param config Loader configuration
 * @returns Set of normalized IDs found
 */
export async function loadFromTable(config: LoaderConfig): Promise<Set<string>> {
  const results = new Set<string>();
  const base = config.baseUrl.replace(/\/$/, '');
  const rowSelector = config.tableRowSelector || 'table tr';
  const cellSelector = config.tableCellSelector || 'td';
  
  try {
    const res = await requestUrl({ url: `${base}${config.indexPath}`, method: 'GET' });
    if (res.status < 200 || res.status >= 300) return results;
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(res.text, 'text/html');
    const rows = Array.from(doc.querySelectorAll(rowSelector));
    
    for (const row of rows) {
      const cell = row.querySelector(cellSelector);
      if (!cell?.textContent?.trim()) continue;

      let name = cell.textContent.trim();

      // Apply replace patterns
      if (config.replacePatterns) {
        for (const [search, replace] of config.replacePatterns) {
          name = name.split(search).join(replace);
        }
        name = name.trim();
      }

      // Apply custom filter
      if (config.filterFn && !config.filterFn(name)) continue;

      const ids = nameToSlugs(name);
      for (const id of ids) results.add(id);
      if (ids.length && config.rowProcessor) config.rowProcessor(row, name);
    }
  } catch (e) {
    console.warn(`Failed to load data via table-based method from ${base}${config.indexPath}`, e);
  }
  
  return results;
}

