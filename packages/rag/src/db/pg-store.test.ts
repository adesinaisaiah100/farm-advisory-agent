import { drizzle } from 'drizzle-orm/pg-proxy';
import { describe, expect, it } from 'vitest';
import { EMBED_DIMS } from '../embed/embedder.js';
import type { ChunkSearchQuery } from '../search/store.js';
import { PgChunkRepository } from './pg-store.js';
import { ragSchema, type RagDatabase } from './client.js';

interface CapturedQuery {
  sql: string;
  params: unknown[];
}

/**
 * A real Drizzle query builder that never opens a socket. It records the SQL and
 * parameters a query would have sent, which is the only place the parameter
 * binding is observable. The in-memory store double cannot catch a bad bind: it
 * receives a `readonly string[]` either way.
 */
function capturingDb(): { db: RagDatabase; captured: CapturedQuery[] } {
  const captured: CapturedQuery[] = [];
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      captured.push({ sql, params });
      return { rows: [] };
    },
    { schema: ragSchema },
  );
  return { db: db as unknown as RagDatabase, captured };
}

function queryOf(overrides: Partial<ChunkSearchQuery> = {}): ChunkSearchQuery {
  return {
    vector: new Array<number>(EMBED_DIMS).fill(0.1),
    topK: 4,
    limit: 8,
    ...overrides,
  };
}

describe('PgChunkRepository parameter binding', () => {
  it('binds the species filter as one text[] parameter', async () => {
    const { db, captured } = capturingDb();

    await new PgChunkRepository(db).search(
      queryOf({ species: ['broiler', 'layer', 'cockerel'] }),
    );

    expect(captured).toHaveLength(1);
    const arrayParams = captured[0]?.params?.filter(
      (param) => Array.isArray(param),
    ) as unknown[][];
    expect(arrayParams).toHaveLength(1);
    expect(arrayParams[0]).toEqual(['broiler', 'layer', 'cockerel']);
  });

  it('binds the disease filter as one text[] parameter', async () => {
    const { db, captured } = capturingDb();

    await new PgChunkRepository(db).search(
      queryOf({ diseases: ['coccidiosis', 'newcastle', 'fowlpox'] }),
    );

    const arrayParams = captured[0]?.params?.filter(
      (param) => Array.isArray(param),
    ) as unknown[][];
    expect(arrayParams).toHaveLength(1);
    expect(arrayParams[0]).toEqual(['coccidiosis', 'newcastle', 'fowlpox']);
  });

  it('binds the section filter as one text[] parameter so the ANY cast resolves', async () => {
    const { db, captured } = capturingDb();

    await new PgChunkRepository(db).search(
      queryOf({
        sections: ['disease_treatment', 'drug_monograph', 'antimicrobial_stewardship'],
      }),
    );

    const query = captured[0];
    expect(query).toBeDefined();
    // A multi-element array interpolated bare becomes ANY($1,$2,$3)::text[],
    // which Postgres rejects with "cannot cast type record to text[]".
    expect(query?.sql).not.toMatch(/ANY\s*\(\s*\$[0-9]+\s*,/i);
    expect(query?.sql).toMatch(/= ANY\(\$[0-9]+::text\[\]\)/i);
    const arrayParams = query?.params?.filter((param) => Array.isArray(param)) as unknown[][];
    expect(arrayParams).toHaveLength(1);
    expect(arrayParams[0]).toEqual([
      'disease_treatment',
      'drug_monograph',
      'antimicrobial_stewardship',
    ]);
  });

  it('omits the section filter entirely when no sections are requested', async () => {
    const { db, captured } = capturingDb();

    await new PgChunkRepository(db).search(queryOf({ sections: [] }));

    expect(captured[0]?.sql).not.toMatch(/ANY\(/i);
  });

  it('sends the query vector as a single vector literal parameter', async () => {
    const { db, captured } = capturingDb();
    const vector = new Array<number>(EMBED_DIMS).fill(0);
    vector[0] = 1;

    await new PgChunkRepository(db).search(queryOf({ vector }));

    const query = captured[0];
    expect(query?.sql).toMatch(/<=> \$[0-9]+::vector/);
    expect(query?.params).toContainEqual(`[${vector.join(',')}]`);
  });

  it('rejects an empty query vector instead of sending malformed SQL', async () => {
    const { db, captured } = capturingDb();

    await expect(new PgChunkRepository(db).search(queryOf({ vector: [] }))).rejects.toThrow(
      /empty query vector/i,
    );
    expect(captured).toHaveLength(0);
  });

  it('returns nothing without querying when topK is not positive', async () => {
    const { db, captured } = capturingDb();

    const results = await new PgChunkRepository(db).search(queryOf({ topK: 0 }));

    expect(results).toEqual([]);
    expect(captured).toHaveLength(0);
  });

  it('orders results by cosine distance', async () => {
    const { db, captured } = capturingDb();

    await new PgChunkRepository(db).search(queryOf());

    expect(captured[0]?.sql).toMatch(/ORDER BY/i);
    expect(captured[0]?.sql).toMatch(/<=>/);
  });
});
