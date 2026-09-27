import { and, eq, inArray, Param, sql, type SQL } from 'drizzle-orm';
import { ChunkSchema, type Chunk } from '../schema.js';
import { EMBED_DIMS } from '../embed/embedder.js';
import { chunks, chunkGroups, documents } from './schema.js';
import { StoreError, cosineDistance, type ChunkRepository, type ChunkSearchQuery, type DocumentWrite, type ScoredChunk } from '../search/store.js';
import type { RagDatabase } from './client.js';

function vectorLiteral(vector: readonly number[]): string {
  if (vector.length === 0) {
    throw new StoreError('cannot search with an empty query vector');
  }
  return `[${vector.join(',')}]`;
}

/**
 * Rebuilds the validated `Chunk` from a row. Re-parsing with the Phase 4 schema
 * means a row written by an older or buggy writer cannot smuggle an unvalidated
 * treatment into the ladder.
 */
function rowToChunk(row: typeof chunks.$inferSelect): Chunk {
  return ChunkSchema.parse({
    id: row.id,
    groupId: row.groupId,
    documentId: row.documentId,
    position: row.position,
    text: row.text,
    heading: row.heading,
    sectionKind: row.sectionKind,
    species: row.species,
    diseases: row.diseases,
    treatment: row.treatment ?? undefined,
    page: row.page,
    pageEnd: row.pageEnd,
    tokenCount: row.tokenCount,
    oversized: row.oversized,
    source: row.source,
    publisher: row.publisher,
    locator: row.locator,
  });
}

function conditionsFor(query: ChunkSearchQuery): SQL[] {
  const conditions: SQL[] = [];
  // `&&` and `@>` are the operators the GIN indexes on species and diseases serve.
  // Each array is wrapped in Param so it binds as ONE text[] value; left bare,
  // Drizzle expands the array into one placeholder per element and Postgres
  // rejects the cast with "cannot cast type record to text[]".
  if (query.species !== undefined && query.species.length > 0) {
    conditions.push(sql`${chunks.species} && ${new Param([...query.species])}::text[]`);
  }
  if (query.diseases !== undefined && query.diseases.length > 0) {
    conditions.push(sql`${chunks.diseases} @> ${new Param([...query.diseases])}::text[]`);
  }
  if (query.sections !== undefined && query.sections.length > 0) {
    conditions.push(sql`${chunks.sectionKind} = ANY(${new Param([...query.sections])}::text[])`);
  }
  return conditions;
}

export class PgChunkRepository implements ChunkRepository {
  readonly #db: RagDatabase;

  constructor(db: RagDatabase) {
    this.#db = db;
  }

  async search(query: ChunkSearchQuery): Promise<readonly ScoredChunk[]> {
    if (query.topK <= 0) return [];
    const literal = vectorLiteral(query.vector);
    const conditions = conditionsFor(query);

    const rows = await this.#db
      .select({ row: chunks, distance: sql<string>`${chunks.embedding} <=> ${literal}::vector` })
      .from(chunks)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sql`${chunks.embedding} <=> ${literal}::vector`)
      .limit(query.limit);

    return rows.map(({ row, distance }) => ({
      chunk: rowToChunk(row),
      distance: Number(distance),
    }));
  }

  async replaceDocument(write: DocumentWrite): Promise<void> {
    const { document, groups, chunks: rows } = write;
    if (rows.length === 0) {
      throw new StoreError(`document ${document.id} has no chunks to write`);
    }
    // A group is one page/heading section and micro-chunks many times over, so
    // chunks are validated against the set of group ids rather than by position.
    const groupIds = new Set(groups.map((group) => group.id));
    for (const row of rows) {
      if (!groupIds.has(row.chunk.groupId)) {
        throw new StoreError(
          `chunk ${row.chunk.id} points at group ${row.chunk.groupId}, which is not in document ${document.id}`,
        );
      }
      if (row.chunk.documentId !== document.id) {
        throw new StoreError(
          `chunk ${row.chunk.id} claims document ${row.chunk.documentId} inside document ${document.id}`,
        );
      }
      if (row.embedding.length !== EMBED_DIMS) {
        // Postgres would reject the insert anyway; catching it here names the
        // offending chunk instead of surfacing a driver-level dimension error.
        throw new StoreError(
          `chunk ${row.chunk.id} carries ${row.embedding.length} dims, expected ${EMBED_DIMS}`,
        );
      }
    }

    await this.#db.transaction(async (tx) => {
      await tx.delete(chunks).where(eq(chunks.documentId, document.id));
      await tx.delete(chunkGroups).where(eq(chunkGroups.documentId, document.id));
      await tx
        .insert(documents)
        .values({
          id: document.id,
          title: document.title,
          publisher: document.publisher,
          docType: document.docType,
          year: document.year ?? null,
          url: document.url ?? null,
        })
        .onConflictDoUpdate({
          target: documents.id,
          set: {
            title: document.title,
            publisher: document.publisher,
            docType: document.docType,
            year: document.year ?? null,
            url: document.url ?? null,
          },
        });

      await tx.insert(chunkGroups).values(
        groups.map((group) => ({
          id: group.id,
          documentId: group.documentId,
          heading: group.heading,
          sectionKind: group.sectionKind,
          species: group.species,
          diseases: group.diseases,
          treatment: group.treatment ?? null,
          page: group.page,
          pageEnd: group.pageEnd,
          text: group.text,
        })),
      );

      await tx.insert(chunks).values(
        rows.map(({ chunk, embedding }) => ({
          id: chunk.id,
          groupId: chunk.groupId,
          documentId: chunk.documentId,
          position: chunk.position,
          text: chunk.text,
          heading: chunk.heading,
          sectionKind: chunk.sectionKind,
          species: chunk.species,
          diseases: chunk.diseases,
          treatment: chunk.treatment ?? null,
          page: chunk.page,
          pageEnd: chunk.pageEnd,
          tokenCount: chunk.tokenCount,
          oversized: chunk.oversized,
          source: chunk.source,
          publisher: chunk.publisher,
          locator: chunk.locator,
          embedding: [...embedding],
        })),
      );
    });
  }

  async countChunks(): Promise<number> {
    const [row] = await this.#db.select({ value: sql<number>`count(*)::int` }).from(chunks);
    return row?.value ?? 0;
  }

  async countDocuments(): Promise<number> {
    const [row] = await this.#db.select({ value: sql<number>`count(*)::int` }).from(documents);
    return row?.value ?? 0;
  }

  async deleteDocuments(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    // The foreign keys cascade, so deleting the parent rows is enough.
    await this.#db.delete(documents).where(inArray(documents.id, [...ids]));
  }

  async deleteAll(): Promise<void> {
    await this.#db.transaction(async (tx) => {
      await tx.delete(chunks);
      await tx.delete(chunkGroups);
      await tx.delete(documents);
    });
  }
}

export { cosineDistance };
