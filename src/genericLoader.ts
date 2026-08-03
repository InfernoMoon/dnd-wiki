/**
 * genericLoader.ts
 * Generic data loader utility for scraping D&D wiki-style data.
 * Supports both legacy link-based and 2024+ table-based parsing methods.
 * Highly customizable with parameters for different data types.
 */
import { requestUrl } from 'obsidian';
import { nameToSlug } from './utils';

export interface LoaderConfig {
  /** Base URL to fetch from */
  baseUrl: string;
  
  /** Path to index page for table parsing (e.g., "/feats", "/spells") */
  indexPath: string;
  
  /** Regex pattern to match in href attributes. Must have one capture group. (e.g., /^\/feat:([^\s"'>]+)$/i) */
  linkPattern: RegExp;
  
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
}

/**
 * Load data using link-based parsing.
 * Fetches root page and extracts anchor tags with href attributes matching the provided pattern.
 * Use this for wikis that list data as links throughout the page.
 * @param config Loader configuration
 * @returns Set of normalized IDs found
 */
async function loadFromLinks(config: LoaderConfig): Promise<Set<string>> {
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
      const m = config.linkPattern.exec(href);
      if (m && m[1]) {
        let name = m[1];
        
        // Apply custom filter
        if (config.filterFn && !config.filterFn(name)) continue;
        
        const id = nameToSlug(name);
        if (id) results.add(id);
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
async function loadFromTable(config: LoaderConfig): Promise<Set<string>> {
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
    
    let names = rows
      .map(tr => tr.querySelector(cellSelector))
      .filter(td => td?.textContent?.trim().length)
      .map(td => (td?.textContent || '').trim());
    
    // Apply replace patterns
    if (config.replacePatterns) {
      names = names.map(n => {
        let result = n;
        for (const [search, replace] of config.replacePatterns!) {
          result = result.split(search).join(replace);
        }
        return result.trim();
      });
    }
    
    // Apply custom filter
    if (config.filterFn) {
      names = names.filter(n => config.filterFn!(n));
    }
    
    for (const n of names) {
      const id = nameToSlug(n);
      if (id) results.add(id);
    }
  } catch (e) {
    console.warn(`Failed to load data via table-based method from ${base}${config.indexPath}`, e);
  }
  
  return results;
}

/**
 * Generic loader that intelligently combines both scraping methods.
 * Loads data using link-based and/or table-based parsing depending on configuration.
 * Both methods are valid and still-current approaches for different wiki structures.
 * @param config Loader configuration
 * @returns Set of combined normalized IDs from all enabled sources
 */
export async function loadData(config: LoaderConfig): Promise<Set<string>> {
  const results = new Set<string>();
  
  // Determine which methods to use
  const useLink = config.useLinkMethod !== false;
  const useTable = config.useTableMethod !== false;
  
  // Auto-detect 2024 format if not explicitly set
  const is2024 = config.is2024Format !== undefined ? config.is2024Format : config.baseUrl.includes('2024');
  
  // Load using appropriate methods
  if (useLink && !is2024) {
    const linkResults = await loadFromLinks(config);
    for (const id of linkResults) {
      results.add(id);
    }
  } else if (useTable && is2024) {
    const tableResults = await loadFromTable(config);
    for (const id of tableResults) {
      results.add(id);
    }
  } else if (useLink && useTable) {
    // Both methods enabled: try both and combine
    const [linkResults, tableResults] = await Promise.all([
      loadFromLinks(config),
      loadFromTable(config)
    ]);
    
    // Combine results from both methods
    for (const id of linkResults) results.add(id);
    for (const id of tableResults) results.add(id);
  }
  
  return results;
}
