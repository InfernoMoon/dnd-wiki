/**
 * Parse fetched HTML headings and render only sections requested by the
 * `section:` and `sectionFrom:` parameters.
 */
import { renderCollapsible } from './renderer';

export interface SectionDirective {
  kind: 'section' | 'sectionFrom';
  query: string;
}

export interface ParsedSectionDirectives {
  directives: SectionDirective[];
}

function normalizeHeaderText(value: string): string {
  return value.replace(/\s+/g, '').trim().toLowerCase();
}

function getHeaderLevel(header: HTMLElement): number {
  return Number.parseInt(header.tagName.slice(1), 10);
}

function extractSection(
  doc: Document,
  root: Element,
  header: HTMLElement,
  endHeader: HTMLElement | null,
  fallbackTitle: string,
): { title: string; html: string } {
  const range = doc.createRange();
  range.setStartAfter(header);
  if (endHeader) {
    range.setEndBefore(endHeader);
  } else if (root.lastChild) {
    range.setEndAfter(root.lastChild);
  } else {
    range.setEndAfter(header);
  }

  const wrapper = root.cloneNode(false) as HTMLElement;
  wrapper.appendChild(range.cloneContents());
  return {
    title: (header.textContent || '').trim() || fallbackTitle.trim(),
    html: wrapper.innerHTML,
  };
}

function extractSingleSection(
  doc: Document,
  root: Element,
  headers: HTMLElement[],
  query: string,
): Array<{ title: string; html: string }> {
  const headerIndex = headers.findIndex((header) => normalizeHeaderText(header.textContent || '') === normalizeHeaderText(query));
  if (headerIndex === -1) return [];

  const header = headers[headerIndex];
  const nextSameLevelHeader = headers
    .slice(headerIndex + 1)
    .find((candidate) => candidate.tagName === header.tagName) ?? null;
  return [extractSection(doc, root, header, nextSameLevelHeader, query)];
}

function extractSectionRange(
  doc: Document,
  root: Element,
  headers: HTMLElement[],
  query: string,
): Array<{ title: string; html: string }> {
  const startIndex = headers.findIndex((header) => normalizeHeaderText(header.textContent || '') === normalizeHeaderText(query));
  if (startIndex === -1) return [];

  const startHeader = headers[startIndex];
  const startLevel = getHeaderLevel(startHeader);
  let boundaryIndex = headers.length;

  for (let i = startIndex + 1; i < headers.length; i++) {
    const header = headers[i];
    const level = getHeaderLevel(header);
    if (level < startLevel) {
      boundaryIndex = i;
      break;
    }
  }

  const sameLevelIndices: number[] = [];
  for (let i = startIndex; i < boundaryIndex; i++) {
    if (getHeaderLevel(headers[i]) === startLevel) sameLevelIndices.push(i);
  }

  return sameLevelIndices.map((headerIndex, index) => {
    const nextHeaderIndex = sameLevelIndices[index + 1] ?? boundaryIndex;
    const endHeader = nextHeaderIndex < headers.length ? headers[nextHeaderIndex] : null;
    return extractSection(doc, root, headers[headerIndex], endHeader, query);
  });
}

function extractSectionsFromHtml(
  contentHtml: string,
  directives: SectionDirective[],
): Array<{ title: string; html: string }> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="section-root">${contentHtml}</div>`, 'text/html');
  const root = doc.querySelector('#section-root');
  if (!root) return [];

  const headers = Array.from(root.querySelectorAll<HTMLHeadingElement>('h1,h2,h3,h4,h5,h6'));
  if (!headers.length) return [];

  const results: Array<{ title: string; html: string }> = [];
  for (const directive of directives) {
    const extracted = directive.kind === 'sectionFrom'
      ? extractSectionRange(doc, root, headers, directive.query)
      : extractSingleSection(doc, root, headers, directive.query);
    results.push(...extracted);
  }
  return results;
}

export function parseSectionDirectives(source: string, afterOffset: number): ParsedSectionDirectives {
  const directives: SectionDirective[] = [];
  const matches: RegExpExecArray[] = [];
  const pattern = /^(section|sectionFrom):\s*(.+)$/gim;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    if ((match.index ?? Number.MAX_SAFE_INTEGER) > afterOffset) matches.push(match);
  }

  for (const directiveMatch of matches) {
    const kind = directiveMatch[1].toLowerCase();
    const query = (directiveMatch[2] || '').trim();
    if (!query) continue;

    if (kind === 'section') {
      directives.push({ kind: 'section', query });
    } else if (kind === 'sectionfrom') {
      directives.push({ kind: 'sectionFrom', query });
    }
  }

  return { directives };
}

export function renderWithSections(
  host: HTMLElement,
  fallbackTitle: string,
  contentHtml: string,
  sectionDirectives: ParsedSectionDirectives,
  missingSectionsMessagePrefix: string,
): void {
  if (!sectionDirectives.directives.length) {
    renderCollapsible(host, fallbackTitle, contentHtml);
    return;
  }

  const sections = extractSectionsFromHtml(contentHtml, sectionDirectives.directives);
  if (!sections.length) {
    const queries = sectionDirectives.directives.map((directive) => directive.query);
    host.textContent = `${missingSectionsMessagePrefix}: ${queries.join(', ')}`;
    return;
  }

  for (const section of sections) {
    const sectionHost = host.createDiv();
    renderCollapsible(sectionHost, section.title, section.html);
  }
}
