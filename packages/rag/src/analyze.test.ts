import { describe, expect, it } from 'vitest';
import { analyzeDocument, normalizeDiseases, RegionMapError } from './analyze.js';
import type { Analyzer, AnalyzeRequest } from './analyze.js';
import type { Page, SourceDocument } from './schema.js';

const document: SourceDocument = {
  id: 'woah-nd',
  title: 'Newcastle disease technical disease card',
  publisher: 'WOAH',
  docType: 'disease_card',
};

const pages: Page[] = [
  { number: 1, text: 'Newcastle disease is a highly contagious notifiable viral disease of poultry.' },
  { number: 2, text: 'Treatment is supportive care only. No antiviral is available for poultry.' },
];

const request: AnalyzeRequest = {
  document,
  pages,
  text: '[PAGE 1]\n[PAGE 2]',
};

function analyzerReturning(value: unknown, calls?: { count: number }): Analyzer {
  return {
    analyze: async (): Promise<unknown> => {
      if (calls) calls.count += 1;
      return value;
    },
  };
}

describe('analyzeDocument', () => {
  it('makes exactly one map call per document', async () => {
    const calls = { count: 0 };
    await analyzeDocument(
      request,
      analyzerReturning(
        {
          regions: [
            {
              heading: 'Aetiology',
              sectionKind: 'disease_signs',
              species: ['poultry'],
              diseases: ['newcastle'],
              text: 'Newcastle disease is a highly contagious notifiable viral disease of poultry.',
            },
          ],
        },
        calls,
      ),
    );
    expect(calls.count).toBe(1);
  });

  it('locates the page from the region text rather than the hint', async () => {
    const result = await analyzeDocument(
      request,
      analyzerReturning({
        regions: [
          {
            heading: 'Treatment',
            sectionKind: 'disease_treatment',
            species: ['poultry'],
            diseases: ['newcastle'],
            text: 'Treatment is supportive care only. No antiviral is available for poultry.',
            pageHint: 1,
          },
        ],
      }),
    );
    expect(result.regions[0]?.page).toBe(2);
    expect(result.warnings.join(' ')).toContain('claimed page 1');
  });

  it('falls back to the hint and warns when the text cannot be found', async () => {
    const result = await analyzeDocument(
      request,
      analyzerReturning({
        regions: [
          {
            heading: 'Treatment',
            sectionKind: 'disease_treatment',
            species: ['poultry'],
            diseases: ['newcastle'],
            text: 'A claim the pages do not contain at all in any form whatsoever.',
            pageHint: 2,
          },
        ],
      }),
    );
    expect(result.regions[0]?.page).toBe(2);
    expect(result.warnings.join(' ')).toContain('could not be located');
  });

  it('falls back to the first page when nothing is known', async () => {
    const result = await analyzeDocument(
      request,
      analyzerReturning({
        regions: [
          {
            heading: 'Treatment',
            sectionKind: 'disease_treatment',
            species: ['poultry'],
            text: 'Nothing in the document mentions this claim anywhere at all.',
          },
        ],
      }),
    );
    expect(result.regions[0]?.page).toBe(1);
  });

  it('rejects an unparseable region map', async () => {
    await expect(
      analyzeDocument(request, analyzerReturning({ regions: [{ heading: 42 }] })),
    ).rejects.toBeInstanceOf(RegionMapError);
  });

  it('rejects a map that is not an object with regions', async () => {
    await expect(analyzeDocument(request, analyzerReturning('nope'))).rejects.toBeInstanceOf(
      RegionMapError,
    );
  });

  it('accepts an empty region list', async () => {
    const result = await analyzeDocument(request, analyzerReturning({ regions: [] }));
    expect(result.regions).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe('normalizeDiseases', () => {
  it('drops the unknown placeholder and de-duplicates', async () => {
    const result = await analyzeDocument(
      request,
      analyzerReturning({
        regions: [
          {
            heading: 'Aetiology',
            sectionKind: 'disease_signs',
            species: ['poultry'],
            diseases: ['newcastle', 'unknown', 'newcastle'],
            text: 'Newcastle disease is a highly contagious notifiable viral disease of poultry.',
          },
        ],
      }),
    );
    expect(normalizeDiseases(result.regions)[0]?.diseases).toEqual(['newcastle']);
  });
});
