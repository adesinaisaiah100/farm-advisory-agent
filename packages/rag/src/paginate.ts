import type { Page } from './schema.js';
import { splitSentences } from './sentences.js';

export const DEFAULT_PAGE_CHARS = 3000;

export function pageStamp(pageNumber: number): string {
  return `[PAGE ${pageNumber}]`;
}

export function stampedText(pages: readonly Page[]): string {
  return pages.map((page) => `${pageStamp(page.number)}\n${page.text}`).join('\n\n');
}

// Pages break on paragraph boundaries. A paragraph longer than the budget is broken on a
// sentence boundary rather than mid-word, and is given pages of its own.
export function paginate(text: string, maxChars: number = DEFAULT_PAGE_CHARS): Page[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  if (paragraphs.length === 0) return [];

  const pages: Page[] = [];
  let current: string[] = [];
  let currentLength = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    pages.push({ number: pages.length + 1, text: current.join('\n\n') });
    current = [];
    currentLength = 0;
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      flush();
      for (const piece of splitSentences(paragraph)) {
        pages.push({ number: pages.length + 1, text: piece });
      }
      continue;
    }
    if (currentLength > 0 && currentLength + paragraph.length + 2 > maxChars) flush();
    current.push(paragraph);
    currentLength += paragraph.length + 2;
  }

  flush();
  return pages;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Page attribution is computed here, not asked of the model. A region is located by searching the
// pages for its own opening text, so a hallucinated page number cannot place a citation.
export function locatePage(regionText: string, pages: readonly Page[]): number | undefined {
  const needle = normalize(regionText).slice(0, 80);
  if (needle.length < 20) return undefined;
  for (const page of pages) {
    if (normalize(page.text).includes(needle)) return page.number;
  }
  return undefined;
}
