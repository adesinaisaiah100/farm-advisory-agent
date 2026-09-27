import { describe, expect, it } from 'vitest';
import { checkReadiness } from './readiness.js';
import { InMemoryVectorStore, type VectorStore } from './search/store.js';
import { fakeEmbedder, makeChunk, makeGroup, oneHot } from './search/fixtures.js';

async function storeWithOneChunk(): Promise<InMemoryVectorStore> {
  const store = new InMemoryVectorStore();
  await store.replaceDocument({
    document: { id: 'doc-a', title: 'A', publisher: 'P', docType: 'disease_card' },
    groups: [makeGroup()],
    chunks: [{ chunk: makeChunk(), embedding: oneHot(0) }],
  });
  return store;
}

function storeThatThrows(): VectorStore {
  return {
    search: async () => {
      throw new Error('connection terminated');
    },
    countChunks: async () => {
      throw new Error('connection terminated');
    },
  };
}

describe('checkReadiness', () => {
  it('reports ready when postgres has a corpus and the embedder answers', async () => {
    const report = await checkReadiness({
      store: await storeWithOneChunk(),
      embedder: fakeEmbedder({}),
    });

    expect(report.ready).toBe(true);
    expect(report.postgres.ok).toBe(true);
    expect(report.embed.detail).toMatch(/768 dims/);
    expect(report.stages.detail).toMatch(/1 documents, 1 chunks/);
  });

  it('is not ready when the database cannot be reached', async () => {
    const report = await checkReadiness({ store: storeThatThrows(), embedder: fakeEmbedder({}) });

    expect(report.ready).toBe(false);
    expect(report.postgres.detail).toMatch(/connection terminated/);
  });

  it('is not ready when the schema has no corpus in it', async () => {
    const report = await checkReadiness({
      store: new InMemoryVectorStore(),
      embedder: fakeEmbedder({}),
    });

    expect(report.ready).toBe(false);
    expect(report.stages.ok).toBe(false);
    expect(report.stages.detail).toMatch(/corpus is empty/);
  });

  it('is not ready when a store cannot report how many documents it holds', async () => {
    const report = await checkReadiness({ store: storeThatThrows(), embedder: fakeEmbedder({}) });

    expect(report.stages.ok).toBe(false);
  });

  it('is not ready when the embedding provider rejects the key', async () => {
    const report = await checkReadiness({
      store: await storeWithOneChunk(),
      embedder: {
        dims: 768,
        embed: async () => {
          throw new Error('API key not valid');
        },
      },
    });

    expect(report.ready).toBe(false);
    expect(report.embed.detail).toMatch(/API key not valid/);
  });

  it('is not ready when the embedder answers with the wrong width', async () => {
    const report = await checkReadiness({
      store: await storeWithOneChunk(),
      embedder: {
        dims: 768,
        embed: async () => [[0.1, 0.2]],
      },
    });

    expect(report.ready).toBe(false);
    expect(report.embed.detail).toMatch(/returned 2 dims, expected 768/);
  });
});
