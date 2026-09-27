import { config as loadEnv } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gateLadder } from '@poultry/core';
import type { CaseData } from '@poultry/schemas';
import { createDb, createPool } from '../db/client.js';
import { PgChunkRepository } from '../db/pg-store.js';
import { EMBED_DIMS, type Embedder } from '../embed/embedder.js';
import { GeminiEmbedder } from '../embed/gemini.js';
import { ChunkGroupSchema, ChunkSchema, type Chunk, type ChunkGroup } from '../schema.js';
import { ladderFromRows, searchChunks } from './retrieve.js';

loadEnv({ path: '../../.env' });

const RUN_INTEG = process.env.RUN_INTEG === '1';
const PREFIX = 'integ-phase5';

// Deliberately non-clinical fixture prose under obviously synthetic publisher
// names. This run proves the Neon + pgvector + Gemini wiring; it is not
// evidence, and nothing here may reach a farmer.
const FIXTURES = [
  {
    id: `${PREFIX}-a`,
    title: 'Integration fixture A: protozoal enteritis in broilers',
    publisher: 'Integration Fixture Manual A',
    species: ['broiler'] as const,
    diseases: ['coccidiosis'] as const,
    productClass: 'anticoccidial',
    text: 'Protozoal enteritis in broilers is treated with an anticoccidial feed additive. Confirm the parasite on a faecal count before treating, and recheck the litter condition daily.',
  },
  {
    id: `${PREFIX}-b`,
    title: 'Integration fixture B: coccidiosis control programme',
    publisher: 'Integration Fixture Manual B',
    species: ['broiler'] as const,
    diseases: ['coccidiosis'] as const,
    productClass: 'anticoccidial',
    text: 'A coccidiosis control programme rotates anticoccidials to slow resistance. Feed the anticoccidial for the full recommended course rather than a shortened course.',
  },
  {
    id: `${PREFIX}-c`,
    title: 'Integration fixture C: paramyxovirus vaccination schedule',
    publisher: 'Integration Fixture Manual C',
    species: ['broiler'] as const,
    diseases: ['newcastle'] as const,
    productClass: 'vaccine',
    text: 'Paramyxovirus control depends on a vaccination schedule and cold-chain handling of the vaccine. Antiviral therapy is not available for routine field use.',
  },
] as const;

function caseFor(overrides: Partial<CaseData> = {}): CaseData {
  return {
    status: 'in_progress',
    species: 'broiler',
    symptoms: ['birds dey eat less', 'droppings get water'],
    diseaseHits: ['coccidiosis'],
    ...overrides,
  };
}

function groupFor(fixture: (typeof FIXTURES)[number]): ChunkGroup {
  return ChunkGroupSchema.parse({
    id: `${fixture.id}#g0`,
    documentId: fixture.id,
    heading: fixture.title,
    sectionKind: 'disease_treatment',
    species: [...fixture.species],
    diseases: [...fixture.diseases],
    treatment: {
      productClass: fixture.productClass,
      why: 'integration fixture evidence for wiring only',
      askTheSeller: [`${fixture.productClass} for ${fixture.diseases[0]}`],
      needsVet: false,
    },
    page: 1,
    pageEnd: 1,
    text: fixture.text,
  });
}

function chunkFor(fixture: (typeof FIXTURES)[number], embedding: readonly number[]): {
  chunk: Chunk;
  embedding: number[];
} {
  const group = groupFor(fixture);
  return {
    chunk: ChunkSchema.parse({
      id: `${group.id}#c0`,
      groupId: group.id,
      documentId: fixture.id,
      position: 0,
      text: fixture.text,
      heading: fixture.title,
      sectionKind: 'disease_treatment',
      species: [...fixture.species],
      diseases: [...fixture.diseases],
      treatment: group.treatment,
      page: 1,
      pageEnd: 1,
      tokenCount: 40,
      oversized: false,
      source: fixture.publisher,
      publisher: fixture.publisher,
      locator: `p.1 ${fixture.title}`,
    }),
    embedding: [...embedding],
  };
}

describe.sequential('neon + pgvector + gemini retrieval', () => {
  const pool = createPool({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? '' });
  const repo = new PgChunkRepository(createDb(pool));
  const embedder: Embedder = new GeminiEmbedder({
    apiKey: process.env.GEMINI_API_KEY ?? '',
    dims: EMBED_DIMS,
  });

  beforeAll(async () => {
    if (!RUN_INTEG) return;
    await repo.deleteDocuments(FIXTURES.map((fixture) => fixture.id));
    const vectors = await embedder.embed(
      FIXTURES.map((fixture) => fixture.text),
      { taskType: 'RETRIEVAL_DOCUMENT' },
    );
    for (const [index, fixture] of FIXTURES.entries()) {
      // One call per document, the way the real ingestor writes.
      await repo.replaceDocument({
        document: {
          id: fixture.id,
          title: fixture.title,
          publisher: fixture.publisher,
          docType: 'disease_card',
        },
        groups: [groupFor(fixture)],
        chunks: [chunkFor(fixture, vectors[index] ?? [])],
      });
    }
  });

  afterAll(async () => {
    if (!RUN_INTEG) return;
    await repo.deleteDocuments(FIXTURES.map((fixture) => fixture.id));
    await pool.end();
  });

  it.skipIf(!RUN_INTEG)('stores 768-dim vectors in pgvector', async () => {
    const [vector] = await embedder.embed(['poultry integration probe']);
    expect(vector).toHaveLength(EMBED_DIMS);
    expect(repo).toBeDefined();
  });

  it.skipIf(!RUN_INTEG)('ranks the two matching sources above the unrelated one', async () => {
    const result = await searchChunks(caseFor(), { store: repo, embedder });

    expect(result.stage).toBe('filtered');
    const sources = result.rows.map((row) => row.chunk.documentId);
    expect(sources.slice(0, 2).sort()).toEqual([`${PREFIX}-a`, `${PREFIX}-b`]);
    expect(sources).not.toContain(`${PREFIX}-c`);
  });

  it.skipIf(!RUN_INTEG)('produces a ladder two independent sources support', async () => {
    const result = await searchChunks(caseFor(), { store: repo, embedder });
    const retrieval = ladderFromRows(caseFor(), result);

    expect(retrieval.ladder?.productClass).toBe('anticoccidial');
    expect(retrieval.totalSources).toBeGreaterThanOrEqual(2);
    expect(gateLadder(caseFor(), retrieval.ladder).permitted).toBe(true);
  });

  it.skipIf(!RUN_INTEG)('falls back to the vector when no source matches the filters', async () => {
    const result = await searchChunks(
      caseFor({ species: 'layer', diseaseHits: ['fowlpox'] }),
      { store: repo, embedder },
    );

    expect(result.starved).toBe(true);
    expect(result.stage).toBe('starvation_fallback');
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it.skipIf(!RUN_INTEG)('leaves the corpus clean behind it', async () => {
    await repo.deleteDocuments(FIXTURES.map((fixture) => fixture.id));
    expect(await repo.countDocuments()).toBe(0);
  });
});
