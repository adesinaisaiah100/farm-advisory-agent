import { describe, expect, it } from 'vitest';
import { gateLadder } from '@poultry/core';
import {
  RagClinicalLadderSource,
  ladderFromRows,
  renderRetrievalContext,
  searchChunks,
} from './retrieve.js';
import { queryTextFor } from './plan.js';
import { InMemoryVectorStore } from './store.js';
import { fakeEmbedder, makeCase, makeChunk, makeGroup, oneHot, treatment } from './fixtures.js';

const QUERY_TEXT = queryTextFor(makeCase());
const QUERY = oneHot(0);

interface Seed {
  readonly id: string;
  readonly groupId: string;
  readonly source: string;
  readonly at: number;
  readonly chunk?: ReturnType<typeof makeChunk>;
}

async function seeded(chunks: readonly Seed[]): Promise<InMemoryVectorStore> {
  const store = new InMemoryVectorStore();
  const groupIds = [...new Set(chunks.map((c) => c.groupId))];
  const groups = groupIds.map((id) => makeGroup({ id, documentId: 'doc-a' }));
  const document = { id: 'doc-a', title: 'A', publisher: 'P', docType: 'disease_card' as const };
  await store.replaceDocument({
    document,
    groups,
    chunks: chunks.map((c) => ({
      chunk:
        c.chunk ??
        makeChunk({
          id: c.id,
          groupId: c.groupId,
          documentId: 'doc-a',
          source: c.source,
          publisher: c.source,
          locator: `${c.source} ${c.id}`,
        }),
      embedding: oneHot(c.at),
    })),
  });
  return store;
}

const SOURCE_A: Seed = { id: 'a#c0', groupId: 'doc-a#g0', source: 'Manual A', at: 0 };
const SOURCE_B: Seed = { id: 'b#c0', groupId: 'doc-a#g1', source: 'Manual B', at: 1 };

function deps(store: InMemoryVectorStore) {
  return { store, embedder: fakeEmbedder({ [QUERY_TEXT]: QUERY }) };
}

describe('searchChunks', () => {
  it('ranks the nearest filtered chunk first', async () => {
    const result = await searchChunks(makeCase(), deps(await seeded([SOURCE_B, SOURCE_A])));

    expect(result.stage).toBe('filtered');
    expect(result.rows.map((r) => r.chunk.id)).toEqual(['a#c0', 'b#c0']);
  });

  it('keeps the species filter while it has enough to work with', async () => {
    const store = await seeded([
      SOURCE_A,
      SOURCE_B,
      {
        id: 'layer#c0',
        groupId: 'doc-a#g2',
        source: 'Manual C',
        at: 0,
        chunk: makeChunk({
          id: 'layer#c0',
          groupId: 'doc-a#g2',
          documentId: 'doc-a',
          species: ['layer'],
          source: 'Manual C',
        }),
      },
    ]);

    const result = await searchChunks(makeCase(), deps(store));

    expect(result.rows.map((r) => r.chunk.id)).toEqual(['a#c0', 'b#c0']);
  });

  it('keeps the filters when they return exactly the starvation floor', async () => {
    const result = await searchChunks(makeCase(), deps(await seeded([SOURCE_A, SOURCE_B])));

    expect(result.filteredCount).toBe(2);
    expect(result.starved).toBe(false);
  });

  it('falls back to the pure vector when the filters starve', async () => {
    const store = await seeded([
      {
        id: 'a#c0',
        groupId: 'doc-a#g0',
        source: 'Manual A',
        at: 0,
        chunk: makeChunk({
          id: 'a#c0',
          groupId: 'doc-a#g0',
          species: ['layer'],
          source: 'Manual A',
          publisher: 'Manual A',
          locator: 'Manual A a#c0',
        }),
      },
      {
        id: 'b#c0',
        groupId: 'doc-a#g1',
        source: 'Manual B',
        at: 1,
        chunk: makeChunk({
          id: 'b#c0',
          groupId: 'doc-a#g1',
          species: ['layer'],
          source: 'Manual B',
          publisher: 'Manual B',
          locator: 'Manual B b#c0',
        }),
      },
    ]);

    const result = await searchChunks(makeCase(), deps(store));

    expect(result.stage).toBe('starvation_fallback');
    expect(result.starved).toBe(true);
    expect(result.filteredCount).toBe(0);
    expect(result.rows).toHaveLength(2);
  });

  it('embeds the query as a retrieval query', async () => {
    const store = await seeded([SOURCE_A, SOURCE_B]);
    const embedder = fakeEmbedder({ [QUERY_TEXT]: QUERY });

    await searchChunks(makeCase(), { store, embedder });

    expect(embedder.calls[0]?.options?.taskType).toBe('RETRIEVAL_QUERY');
  });

  it('fails loudly when the embedder returns nothing for the query', async () => {
    const store = await seeded([SOURCE_A]);
    const empty = { dims: QUERY.length, calls: [] as unknown[], embed: async () => [] };

    await expect(searchChunks(makeCase(), { store, embedder: empty })).rejects.toThrow(
      /no vector for the query/,
    );
  });
});

describe('ladderFromRows', () => {
  it('builds a ladder two independent sources agree on', async () => {
    const result = await searchChunks(makeCase(), deps(await seeded([SOURCE_A, SOURCE_B])));

    const { ladder } = ladderFromRows(makeCase(), result);

    expect(ladder?.disease).toBe('coccidiosis');
    expect(ladder?.productClass).toBe('anticoccidial');
    expect(ladder?.evidence.agreement).toBe(1);
    expect(ladder?.evidence.citations.map((c) => c.source)).toEqual(['Manual A', 'Manual B']);
  });

  it('lets the gate permit a product the sources agree on', async () => {
    const result = await searchChunks(makeCase(), deps(await seeded([SOURCE_A, SOURCE_B])));

    const gate = gateLadder(makeCase(), ladderFromRows(makeCase(), result).ladder);

    expect(gate.permitted).toBe(true);
  });

  it('will not let one document corroborate itself', async () => {
    const store = await seeded([
      { id: 'a#c0', groupId: 'doc-a#g0', source: 'Manual A', at: 0 },
      { id: 'a#c1', groupId: 'doc-a#g0', source: 'Manual A', at: 1 },
      { id: 'a#c2', groupId: 'doc-a#g0', source: 'Manual A', at: 2 },
    ]);
    const result = await searchChunks(makeCase(), deps(store));

    const gate = gateLadder(makeCase(), ladderFromRows(makeCase(), result).ladder);

    expect(result.rows).toHaveLength(2);
    expect(gate.permitted).toBe(false);
    expect(gate.reasons.join(' ')).toMatch(/2 independent sources/);
  });

  it('refuses when the sources disagree on the product class', async () => {
    const store = await seeded([
      SOURCE_A,
      {
        id: 'b#c0',
        groupId: 'doc-a#g1',
        source: 'Manual B',
        at: 1,
        chunk: makeChunk({
          id: 'b#c0',
          groupId: 'doc-a#g1',
          documentId: 'doc-a',
          source: 'Manual B',
          publisher: 'Manual B',
          locator: 'Manual B b#c0',
          treatment: treatment({ productClass: 'antibiotic' }),
        }),
      },
    ]);
    const result = await searchChunks(makeCase(), deps(store));

    const gate = gateLadder(makeCase(), ladderFromRows(makeCase(), result).ladder);

    expect(gate.permitted).toBe(false);
    expect(gate.reasons.join(' ')).toMatch(/do not agree/);
  });

  it('reports the winning support share so a caller can see the split', async () => {
    const store = await seeded([
      SOURCE_A,
      SOURCE_B,
      {
        id: 'c#c0',
        groupId: 'doc-a#g2',
        source: 'Manual C',
        at: 2,
        chunk: makeChunk({
          id: 'c#c0',
          groupId: 'doc-a#g2',
          documentId: 'doc-a',
          source: 'Manual C',
          publisher: 'Manual C',
          locator: 'Manual C c#c0',
          treatment: treatment({ productClass: 'antibiotic' }),
        }),
      },
    ]);
    const result = await searchChunks(makeCase(), deps(store));

    const retrieval = ladderFromRows(makeCase(), result);

    expect(retrieval.supportingSources).toBe(2);
    expect(retrieval.totalSources).toBe(3);
    expect(retrieval.ladder?.evidence.agreement).toBeCloseTo(2 / 3, 10);
    expect(gateLadder(makeCase(), retrieval.ladder).permitted).toBe(true);
  });

  it('builds no ladder when no chunk carries a treatment', async () => {
    const store = await seeded([
      {
        id: 's#c0',
        groupId: 'doc-a#g0',
        source: 'Manual A',
        at: 0,
        chunk: makeChunk({
          id: 's#c0',
          groupId: 'doc-a#g0',
          documentId: 'doc-a',
          source: 'Manual A',
          sectionKind: 'disease_signs',
          treatment: undefined,
        }),
      },
      {
        id: 's2#c0',
        groupId: 'doc-a#g1',
        source: 'Manual B',
        at: 1,
        chunk: makeChunk({
          id: 's2#c0',
          groupId: 'doc-a#g1',
          documentId: 'doc-a',
          source: 'Manual B',
          sectionKind: 'disease_signs',
          treatment: undefined,
        }),
      },
    ]);
    const result = await searchChunks(makeCase(), deps(store));

    expect(ladderFromRows(makeCase(), result).ladder).toBeUndefined();
  });

  it('builds no ladder when the disease cannot be determined', async () => {
    const store = await seeded([
      {
        id: 'u#c0',
        groupId: 'doc-a#g0',
        source: 'Manual A',
        at: 0,
        chunk: makeChunk({
          id: 'u#c0',
          groupId: 'doc-a#g0',
          documentId: 'doc-a',
          source: 'Manual A',
          publisher: 'Manual A',
          locator: 'Manual A u#c0',
          diseases: ['unknown'],
        }),
      },
      {
        id: 'u2#c0',
        groupId: 'doc-a#g1',
        source: 'Manual B',
        at: 1,
        chunk: makeChunk({
          id: 'u2#c0',
          groupId: 'doc-a#g1',
          documentId: 'doc-a',
          source: 'Manual B',
          publisher: 'Manual B',
          locator: 'Manual B u2#c0',
          diseases: ['unknown'],
        }),
      },
    ]);
    const c = makeCase({ diseaseHits: undefined });

    const result = await searchChunks(c, deps(store));

    expect(ladderFromRows(c, result).ladder).toBeUndefined();
  });
});

describe('RagClinicalLadderSource', () => {
  it('serves a ladder the gate accepts', async () => {
    const source = new RagClinicalLadderSource(deps(await seeded([SOURCE_A, SOURCE_B])));

    const ladder = await source.retrieve(makeCase());

    expect(ladder?.productClass).toBe('anticoccidial');
    expect(gateLadder(makeCase(), ladder).permitted).toBe(true);
  });

  it('serves nothing rather than guessing when the corpus is empty', async () => {
    const source = new RagClinicalLadderSource({
      store: new InMemoryVectorStore(),
      embedder: fakeEmbedder({ [QUERY_TEXT]: QUERY }),
    });

    const ladder = await source.retrieve(makeCase());

    expect(ladder).toBeUndefined();
    expect(gateLadder(makeCase(), ladder).permitted).toBe(false);
  });
});

describe('renderRetrievalContext', () => {
  it('renders each region with its source and locator', async () => {
    const result = await searchChunks(makeCase(), deps(await seeded([SOURCE_A])));

    expect(renderRetrievalContext(result.rows)).toBe(
      '- (Manual A, Manual A a#c0) Coccidiosis causes bloody droppings and ruffled feathers in young birds. [product class: anticoccidial; needs vet: false]',
    );
  });

  it('omits the product note for a region with no treatment', async () => {
    const chunk = makeChunk({ id: 's#c0', treatment: undefined, text: 'Birds sit hunched.' });

    expect(renderRetrievalContext([{ chunk, distance: 0 }])).toBe(
      '- (Source A, p.1 §Coccidiosis treatment) Birds sit hunched.',
    );
  });

  it('renders nothing for no rows', () => {
    expect(renderRetrievalContext([])).toBe('');
  });
});
