import { describe, expect, it } from 'vitest';
import { locatePage, pageStamp, paginate, stampedText } from './paginate.js';

function paragraphs(count: number, size: number): string {
  return Array.from({ length: count }, () => 'x'.repeat(size)).join('\n\n');
}

describe('paginate', () => {
  it('keeps a short document on one page', () => {
    const pages = paginate('One paragraph. Another line.', 3000);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.number).toBe(1);
  });

  it('breaks on paragraph boundaries and numbers pages from one', () => {
    const pages = paginate(paragraphs(4, 20), 50);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.map((page) => page.number)).toEqual(
      pages.map((_, index) => index + 1),
    );
  });

  it('never exceeds the budget for paragraphs that fit', () => {
    const pages = paginate(paragraphs(6, 20), 50);
    for (const page of pages) {
      expect(page.text.length).toBeLessThanOrEqual(50);
    }
  });

  it('breaks an oversized paragraph on sentence boundaries', () => {
    const long = `${'alpha beta gamma delta. '.repeat(20).trim()} end.`;
    const pages = paginate(long, 60);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.text.length).toBeLessThanOrEqual(60);
      expect(page.text.endsWith('.')).toBe(true);
    }
  });

  it('is deterministic for the same input', () => {
    const text = paragraphs(5, 30);
    expect(paginate(text, 70)).toEqual(paginate(text, 70));
  });

  it('returns no pages for empty text', () => {
    expect(paginate('   ', 100)).toEqual([]);
  });
});

describe('stampedText', () => {
  it('stamps each page header', () => {
    expect(stampedText([{ number: 1, text: 'first' }, { number: 2, text: 'second' }])).toBe(
      '[PAGE 1]\nfirst\n\n[PAGE 2]\nsecond',
    );
  });

  it('formats a page stamp', () => {
    expect(pageStamp(7)).toBe('[PAGE 7]');
  });
});

describe('locatePage', () => {
  const pages = [
    { number: 1, text: 'Intro paragraph about Newcastle disease in poultry.' },
    { number: 2, text: 'Treatment is by antiviral support and good husbandry.' },
  ];

  it('finds the page holding the region text', () => {
    expect(locatePage('Treatment is by antiviral support', pages)).toBe(2);
  });

  it('tolerates collapsed whitespace between pages and regions', () => {
    expect(locatePage('Treatment   is by\n antiviral support', pages)).toBe(2);
  });

  it('returns nothing when the text is not in any page', () => {
    expect(locatePage('An entirely unrelated claim about feed', pages)).toBeUndefined();
  });

  it('refuses to guess from a fragment too short to be unique', () => {
    expect(locatePage('Short', pages)).toBeUndefined();
  });
});
