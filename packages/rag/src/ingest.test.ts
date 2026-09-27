import { describe, expect, it } from 'vitest';
import type { Analyzer, AnalyzeRequest } from './analyze.js';
import { citationFor, ingestDocument, IngestError, locatorFor } from './ingest.js';
import type { TokenCounter } from './tokens.js';
import type { SourceDocument } from './schema.js';

const words: TokenCounter = {
  count: (text) => (text.length === 0 ? 0 : text.trim().split(/\s+/).length),
};

const SIGNS =
  'Signs include greenish diarrhoea, swelling of the head and neck, and a fall in egg production. Sudden death may be the only sign seen in broilers.';
const TREATMENT =
  'Treatment for Newcastle disease is supportive care only. No antiviral is licensed for use in poultry. Antibiotics do not act against the virus and should not be given as a cure.';
const PREVENTION =
  'Vaccination is the primary control measure for Newcastle disease. Biosecurity limits spread between flocks.';

const RAW = [SIGNS, TREATMENT, PREVENTION].join('\n\n');

const document: SourceDocument = {
  id: 'nd-card',
  title: 'Newcastle disease technical disease card',
  publisher: 'WOAH',
  docType: 'disease_card',
  year: 2024,
};

const treatment = {
  productClass: 'Supportive care only - no antiviral licensed for poultry',
  why: 'Newcastle disease is viral, so no antibiotic acts against it.',
  askTheSeller: ['Is this product for a virus or for bacteria?', 'Does the withdrawal period matter for my birds?'],
  needsVet: true,
};

const REGION_MAP = {
  regions: [
    {
      heading: 'Signs',
      sectionKind: 'disease_signs',
      species: ['poultry'],
      diseases: ['newcastle'],
      text: SIGNS,
    },
    {
      heading: 'Treatment',
      sectionKind: 'disease_treatment',
      species: ['poultry'],
      diseases: ['newcastle'],
      text: TREATMENT,
      treatment,
    },
    {
      heading: 'Prevention',
      sectionKind: 'disease_prevention',
      species: ['poultry'],
      diseases: ['newcastle'],
      text: PREVENTION,
    },
  ],
};

const OPTIONS = {
  analyzer: {
    analyze: async (): Promise<unknown> => REGION_MAP,
  } as Analyzer,
  count: words,
  pageChars: 200,
  targetTokens: 20,
  maxTokens: 20,
  overlapTokens: 8,
};

describe('ingestDocument', () => {
  it('produces the exact golden chunks', async () => {
    const result = await ingestDocument(document, RAW, OPTIONS);

    expect(
      result.chunks.map((chunk) => ({
        id: chunk.id,
        position: chunk.position,
        tokenCount: chunk.tokenCount,
        text: chunk.text,
      })),
    ).toEqual([
      {
        id: 'nd-card#g0#c0',
        position: 0,
        tokenCount: 16,
        text: 'Signs include greenish diarrhoea, swelling of the head and neck, and a fall in egg production.',
      },
      {
        id: 'nd-card#g0#c1',
        position: 1,
        tokenCount: 10,
        text: 'Sudden death may be the only sign seen in broilers.',
      },
      {
        id: 'nd-card#g1#c0',
        position: 0,
        tokenCount: 16,
        text: 'Treatment for Newcastle disease is supportive care only. No antiviral is licensed for use in poultry.',
      },
      {
        id: 'nd-card#g1#c1',
        position: 1,
        tokenCount: 8,
        text: 'No antiviral is licensed for use in poultry.',
      },
      {
        id: 'nd-card#g1#c2',
        position: 2,
        tokenCount: 15,
        text: 'Antibiotics do not act against the virus and should not be given as a cure.',
      },
      {
        id: 'nd-card#g2#c0',
        position: 0,
        tokenCount: 14,
        text: 'Vaccination is the primary control measure for Newcastle disease. Biosecurity limits spread between flocks.',
      },
    ]);
  });

  it('splits groups at page and heading boundaries', async () => {
    const result = await ingestDocument(document, RAW, OPTIONS);
    expect(result.pages.map((page) => page.number)).toEqual([1, 2, 3]);
    expect(result.groups.map((group) => group.heading)).toEqual([
      'Signs',
      'Treatment',
      'Prevention',
    ]);
    expect(result.groups.map((group) => group.page)).toEqual([1, 2, 3]);
  });

  it('produces an exact citation the Phase 2.6 gate can consume', async () => {
    const result = await ingestDocument(document, RAW, OPTIONS);
    const first = result.chunks[0];
    const treatmentChunk = result.chunks[2];
    expect(first).toBeDefined();
    expect(treatmentChunk).toBeDefined();
    if (first === undefined || treatmentChunk === undefined) throw new Error('missing chunks');
    expect(citationFor(first)).toEqual({
      source: 'Newcastle disease technical disease card',
      locator: 'p.1 §Signs',
    });
    expect(citationFor(treatmentChunk)).toEqual({
      source: 'Newcastle disease technical disease card',
      locator: 'p.2 §Treatment',
    });
  });

  it('overlaps consecutive chunks by whole sentences inside an oversized group', async () => {
    const result = await ingestDocument(document, RAW, OPTIONS);
    const treatmentChunks = result.chunks.filter((chunk) => chunk.groupId === 'nd-card#g1');
    expect(treatmentChunks[0]?.text).toContain('No antiviral is licensed for use in poultry.');
    expect(treatmentChunks[1]?.text).toBe('No antiviral is licensed for use in poultry.');
  });

  it('carries the structured treatment onto every chunk of its group', async () => {
    const result = await ingestDocument(document, RAW, OPTIONS);
    const treatmentChunks = result.chunks.filter((chunk) => chunk.groupId === 'nd-card#g1');
    for (const chunk of treatmentChunks) {
      expect(chunk.treatment?.productClass).toBe(treatment.productClass);
      expect(chunk.treatment?.askTheSeller).toHaveLength(2);
    }
  });

  it('makes exactly one analyzer call', async () => {
    let calls = 0;
    const analyzer: Analyzer = {
      analyze: async (): Promise<unknown> => {
        calls += 1;
        return REGION_MAP;
      },
    };
    await ingestDocument(document, RAW, { ...OPTIONS, analyzer });
    expect(calls).toBe(1);
  });

  it('gives the analyzer the stamped page text', async () => {
    let seen: AnalyzeRequest | undefined;
    const analyzer: Analyzer = {
      analyze: async (request): Promise<unknown> => {
        seen = request;
        return REGION_MAP;
      },
    };
    await ingestDocument(document, RAW, { ...OPTIONS, analyzer });
    expect(seen?.pages).toHaveLength(3);
    expect(seen?.text.startsWith('[PAGE 1]')).toBe(true);
    expect(seen?.document.id).toBe('nd-card');
  });

  it('is deterministic for the same document, text and analyzer output', async () => {
    const first = await ingestDocument(document, RAW, OPTIONS);
    const second = await ingestDocument(document, RAW, OPTIONS);
    expect(second).toEqual(first);
  });

  it('rejects a document with no text', async () => {
    await expect(ingestDocument(document, '   ', OPTIONS)).rejects.toBeInstanceOf(IngestError);
  });

  it('rejects an overlap larger than the chunk ceiling', async () => {
    await expect(
      ingestDocument(document, RAW, { ...OPTIONS, targetTokens: 20, maxTokens: 20, overlapTokens: 20 }),
    ).rejects.toBeInstanceOf(IngestError);
  });

  it('rejects a ceiling below the target', async () => {
    await expect(
      ingestDocument(document, RAW, { ...OPTIONS, targetTokens: 30, maxTokens: 20 }),
    ).rejects.toBeInstanceOf(IngestError);
  });

  it('defaults the overlap to a tenth of the target', async () => {
    let captured: number | undefined;
    const analyzer: Analyzer = {
      analyze: async (): Promise<unknown> => {
        captured = 100;
        return REGION_MAP;
      },
    };
    const result = await ingestDocument(document, RAW, {
      analyzer,
      count: words,
      pageChars: 200,
      targetTokens: 1000,
    });
    expect(captured).toBe(100);
    expect(result.chunks).toHaveLength(3);
  });
});

describe('locatorFor', () => {
  it('spans the page range when a group crosses pages', () => {
    expect(
      locatorFor({
        id: 'doc#g0',
        documentId: 'doc',
        heading: 'Treatment',
        sectionKind: 'disease_treatment',
        species: ['poultry'],
        diseases: ['newcastle'],
        page: 2,
        pageEnd: 4,
        text: 'text',
      }),
    ).toBe('p.2-4 §Treatment');
  });
});
