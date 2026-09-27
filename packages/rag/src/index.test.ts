import { describe, expect, it } from 'vitest';
import { ChunkSchema, overlapsChunk, citationFor, type Chunk } from './index.js';

const chunk: Chunk = ChunkSchema.parse({
  id: 'c1',
  groupId: 'g1',
  documentId: 'doc',
  position: 0,
  text: 'Newcastle Disease kills fast.',
  heading: 'Signs',
  sectionKind: 'disease_signs',
  species: ['poultry'],
  diseases: ['newcastle'],
  page: 1,
  pageEnd: 1,
  tokenCount: 5,
  oversized: false,
  source: 'MSD Veterinary Manual',
  publisher: 'MSD',
  locator: 'p.1 §Signs',
});

describe('overlapsChunk', () => {
  it('matches case-insensitively', () => {
    expect(overlapsChunk(chunk, 'newcastle')).toBe(true);
  });

  it('detects non-overlap', () => {
    expect(overlapsChunk(chunk, 'gumboro')).toBe(false);
  });
});

describe('ChunkSchema', () => {
  it('rejects a page range that runs backwards', () => {
    const result = ChunkSchema.safeParse({ ...chunk, page: 4, pageEnd: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects an empty chunk body', () => {
    expect(ChunkSchema.safeParse({ ...chunk, text: '' }).success).toBe(false);
  });

  it('rejects a negative position', () => {
    expect(ChunkSchema.safeParse({ ...chunk, position: -1 }).success).toBe(false);
  });

  it('rejects an unknown section kind', () => {
    expect(ChunkSchema.safeParse({ ...chunk, sectionKind: 'mystery' }).success).toBe(false);
  });

  it('requires a locator so a citation is always possible', () => {
    expect(ChunkSchema.safeParse({ ...chunk, locator: '' }).success).toBe(false);
  });
});

describe('citationFor', () => {
  it('reads straight off the stored chunk', () => {
    expect(citationFor(chunk)).toEqual({
      source: 'MSD Veterinary Manual',
      locator: 'p.1 §Signs',
    });
  });
});
