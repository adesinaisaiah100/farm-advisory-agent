import { describe, expect, it } from 'vitest';
import { InMemoryVectorStore, StoreError, cosineDistance } from './store.js';
import { makeChunk, makeGroup, oneHot, treatment } from './fixtures.js';

describe('cosineDistance', () => {
  it('is zero for the same direction', () => {
    expect(cosineDistance([1, 2, 3], [1, 2, 3])).toBeCloseTo(0, 10);
  });

  it('ignores magnitude', () => {
    expect(cosineDistance([1, 2, 3], [10, 20, 30])).toBeCloseTo(0, 10);
  });

  it('is one for perpendicular vectors', () => {
    expect(cosineDistance([1, 0], [0, 1])).toBeCloseTo(1, 10);
  });

  it('is two for opposite vectors', () => {
    expect(cosineDistance([1, 0], [-1, 0])).toBeCloseTo(2, 10);
  });

  it('rejects vectors of different widths', () => {
    expect(() => cosineDistance([1, 0], [1, 0, 0])).toThrow(StoreError);
  });

  it('rejects a zero vector because direction is undefined', () => {
    expect(() => cosineDistance([0, 0], [1, 0])).toThrow(StoreError);
  });
});

describe('InMemoryVectorStore', () => {
  it('returns the nearest chunk first', async () => {
    const store = new InMemoryVectorStore();
    await store.replaceDocument({
      document: { id: 'doc-a', title: 'A', publisher: 'P', docType: 'disease_card' },
      groups: [makeGroup({ id: 'doc-a#g0' }), makeGroup({ id: 'doc-a#g1' })],
      chunks: [
        { chunk: makeChunk({ groupId: 'doc-a#g0', id: 'doc-a#g0#c0' }), embedding: oneHot(0) },
        { chunk: makeChunk({ groupId: 'doc-a#g1', id: 'doc-a#g1#c0' }), embedding: oneHot(5) },
      ],
    });

    const found = await store.search({ vector: oneHot(0), topK: 2, limit: 10 });

    expect(found.map((r) => r.chunk.id)).toEqual(['doc-a#g0#c0', 'doc-a#g1#c0']);
    expect(found[0]?.distance).toBeCloseTo(0, 10);
  });

  it('keeps a chunk whose species overlaps the filter', async () => {
    const store = new InMemoryVectorStore();
    await store.replaceDocument({
      document: { id: 'doc-a', title: 'A', publisher: 'P', docType: 'disease_card' },
      groups: [makeGroup()],
      chunks: [
        { chunk: makeChunk({ species: ['layer', 'broiler'] }), embedding: oneHot(1) },
      ],
    });

    const found = await store.search({
      vector: oneHot(1),
      topK: 5,
      limit: 10,
      species: ['broiler'],
    });

    expect(found).toHaveLength(1);
  });

  it('drops a chunk whose species does not overlap', async () => {
    const store = new InMemoryVectorStore();
    await store.replaceDocument({
      document: { id: 'doc-a', title: 'A', publisher: 'P', docType: 'disease_card' },
      groups: [makeGroup()],
      chunks: [{ chunk: makeChunk({ species: ['layer'] }), embedding: oneHot(1) }],
    });

    const found = await store.search({
      vector: oneHot(1),
      topK: 5,
      limit: 10,
      species: ['broiler'],
    });

    expect(found).toHaveLength(0);
  });

  it('requires every requested disease to be present', async () => {
    const store = new InMemoryVectorStore();
    await store.replaceDocument({
      document: { id: 'doc-a', title: 'A', publisher: 'P', docType: 'disease_card' },
      groups: [makeGroup()],
      chunks: [
        { chunk: makeChunk({ diseases: ['coccidiosis'] }), embedding: oneHot(1) },
        {
          chunk: makeChunk({ id: 'b', diseases: ['coccidiosis', 'gumboro'] }),
          embedding: oneHot(2),
        },
      ],
    });

    const found = await store.search({
      vector: oneHot(1),
      topK: 5,
      limit: 10,
      diseases: ['coccidiosis', 'gumboro'],
    });

    expect(found.map((r) => r.chunk.id)).toEqual(['b']);
  });

  it('matches any requested section', async () => {
    const store = new InMemoryVectorStore();
    await store.replaceDocument({
      document: { id: 'doc-a', title: 'A', publisher: 'P', docType: 'disease_card' },
      groups: [makeGroup(), makeGroup({ id: 'doc-a#g1' })],
      chunks: [
        { chunk: makeChunk({ groupId: 'doc-a#g0' }), embedding: oneHot(1) },
        {
          chunk: makeChunk({
            id: 'signs#c0',
            groupId: 'doc-a#g1',
            sectionKind: 'disease_signs',
            treatment: undefined,
          }),
          embedding: oneHot(2),
        },
      ],
    });

    const found = await store.search({
      vector: oneHot(1),
      topK: 5,
      limit: 10,
      sections: ['disease_treatment'],
    });

    expect(found.map((r) => r.chunk.id)).toEqual(['doc-a#g0#c0']);
  });

  it('truncates to the requested candidate limit', async () => {
    const store = new InMemoryVectorStore();
    await store.replaceDocument({
      document: { id: 'doc-a', title: 'A', publisher: 'P', docType: 'disease_card' },
      groups: [makeGroup()],
      chunks: [
        { chunk: makeChunk({ id: 'a' }), embedding: oneHot(0) },
        { chunk: makeChunk({ id: 'b' }), embedding: oneHot(1) },
        { chunk: makeChunk({ id: 'c' }), embedding: oneHot(2) },
      ],
    });

    const found = await store.search({ vector: oneHot(0), topK: 1, limit: 2 });

    expect(found).toHaveLength(2);
  });

  it('returns nothing when topK is not positive', async () => {
    const store = new InMemoryVectorStore();
    await expect(store.search({ vector: oneHot(0), topK: 0, limit: 10 })).resolves.toEqual([]);
  });

  it('replaces the previous rows when the same document is ingested again', async () => {
    const store = new InMemoryVectorStore();
    const write = {
      document: { id: 'doc-a', title: 'A', publisher: 'P', docType: 'disease_card' } as const,
      groups: [makeGroup()],
      chunks: [{ chunk: makeChunk({ id: 'old#c0' }), embedding: oneHot(0) }],
    };
    await store.replaceDocument(write);
    await store.replaceDocument({
      ...write,
      chunks: [{ chunk: makeChunk({ id: 'new#c0' }), embedding: oneHot(0) }],
    });

    const found = await store.search({ vector: oneHot(0), topK: 5, limit: 10 });

    expect(found.map((r) => r.chunk.id)).toEqual(['new#c0']);
    await expect(store.countChunks()).resolves.toBe(1);
    await expect(store.countDocuments()).resolves.toBe(1);
  });

  it('empties every table on deleteAll', async () => {
    const store = new InMemoryVectorStore();
    await store.replaceDocument({
      document: { id: 'doc-a', title: 'A', publisher: 'P', docType: 'disease_card' },
      groups: [makeGroup()],
      chunks: [{ chunk: makeChunk(), embedding: oneHot(0) }],
    });

    await store.deleteAll();

    await expect(store.countChunks()).resolves.toBe(0);
    await expect(store.countDocuments()).resolves.toBe(0);
  });

  it('stores a chunk with no treatment without inventing one', async () => {
    const store = new InMemoryVectorStore();
    await store.replaceDocument({
      document: { id: 'doc-a', title: 'A', publisher: 'P', docType: 'disease_card' },
      groups: [makeGroup({ treatment: undefined })],
      chunks: [{ chunk: makeChunk({ treatment: undefined }), embedding: oneHot(0) }],
    });

    const found = await store.search({ vector: oneHot(0), topK: 5, limit: 10 });

    expect(found[0]?.chunk.treatment).toBeUndefined();
    expect(treatment().productClass).toBe('anticoccidial');
  });
});
