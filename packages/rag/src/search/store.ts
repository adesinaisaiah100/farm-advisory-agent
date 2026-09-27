import type { Disease } from '@poultry/schemas';
import type { Chunk, ChunkGroup, SectionKind, SourceDocument, SourceSpecies } from '../schema.js';

export interface ScoredChunk {
  readonly chunk: Chunk;
  readonly distance: number;
}

export interface ChunkSearchQuery {
  readonly vector: readonly number[];
  /** How many chunks the caller wants back. */
  readonly topK: number;
  /**
   * How many ranked candidates to pull before the diversity cap runs. The cap
   * throws rows away, so asking the database for exactly topK would under-fill.
   */
  readonly limit: number;
  readonly species?: readonly SourceSpecies[];
  readonly diseases?: readonly Disease[];
  readonly sections?: readonly SectionKind[];
}

export interface VectorStore {
  search(query: ChunkSearchQuery): Promise<readonly ScoredChunk[]>;
  countChunks(): Promise<number>;
}

export interface DocumentWrite {
  readonly document: SourceDocument;
  readonly groups: readonly ChunkGroup[];
  readonly chunks: readonly { readonly chunk: Chunk; readonly embedding: readonly number[] }[];
}

export interface ChunkRepository extends VectorStore {
  /** Replaces every row for one document, so re-ingesting is idempotent. */
  replaceDocument(write: DocumentWrite): Promise<void>;
  countDocuments(): Promise<number>;
  /** Removes the named documents and their rows, leaving the rest of the corpus. */
  deleteDocuments(ids: readonly string[]): Promise<void>;
  deleteAll(): Promise<void>;
}

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreError';
  }
}

export function cosineDistance(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new StoreError(`cannot compare a ${a.length}-dim vector with a ${b.length}-dim vector`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }
  if (normA === 0 || normB === 0) {
    throw new StoreError('cosine distance is undefined for a zero vector');
  }
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function overlaps(left: readonly string[], right: readonly string[]): boolean {
  return left.some((value) => right.includes(value));
}

function containsAll(left: readonly string[], right: readonly string[]): boolean {
  return right.every((value) => left.includes(value));
}

function matchesFilters(
  chunk: Chunk,
  query: Pick<ChunkSearchQuery, 'species' | 'diseases' | 'sections'>,
): boolean {
  // Mirrors the SQL exactly: `species && $any`, `diseases @> $all`, and
  // `section_kind = ANY($kinds)`. If these two drift apart the unit tests stop
  // proving anything about production, so the operators are named here.
  const { species, diseases, sections } = query;
  if (species !== undefined && species.length > 0 && !overlaps(chunk.species, species)) {
    return false;
  }
  if (diseases !== undefined && diseases.length > 0 && !containsAll(chunk.diseases, diseases)) {
    return false;
  }
  if (sections !== undefined && sections.length > 0 && !sections.includes(chunk.sectionKind)) {
    return false;
  }
  return true;
}

/**
 * The write contract every store must honour, kept next to the in-memory double
 * so the fake cannot quietly accept a payload the real repository would reject.
 */
export function validateWrite(write: DocumentWrite): void {
  const { document, groups, chunks } = write;
  if (chunks.length === 0) {
    throw new StoreError(`document ${document.id} has no chunks to write`);
  }
  const groupIds = new Set(groups.map((group) => group.id));
  for (const { chunk, embedding } of chunks) {
    if (!groupIds.has(chunk.groupId)) {
      throw new StoreError(
        `chunk ${chunk.id} points at group ${chunk.groupId}, which is not in document ${document.id}`,
      );
    }
    if (chunk.documentId !== document.id) {
      throw new StoreError(
        `chunk ${chunk.id} claims document ${chunk.documentId} inside document ${document.id}`,
      );
    }
    if (embedding.length === 0) {
      throw new StoreError(`chunk ${chunk.id} has an empty embedding`);
    }
  }
}

/**
 * The in-memory pgvector double. It reproduces the SQL filter and ordering
 * semantics so the retrieval unit matrix runs with no database, no key and no
 * socket, and so the pure logic stays the thing under test rather than Postgres.
 */
export class InMemoryVectorStore implements ChunkRepository {
  readonly #docs = new Map<string, SourceDocument>();
  readonly #groups = new Map<string, ChunkGroup>();
  readonly #rows = new Map<string, { chunk: Chunk; embedding: readonly number[] }>();

  async replaceDocument(write: DocumentWrite): Promise<void> {
    const { document, groups, chunks } = write;
    validateWrite(write);
    await this.#purgeDocument(document.id);
    this.#docs.set(document.id, document);
    for (const group of groups) {
      this.#groups.set(group.id, group);
    }
    for (const row of chunks) {
      this.#rows.set(row.chunk.id, { chunk: row.chunk, embedding: row.embedding });
    }
  }

  async search(query: ChunkSearchQuery): Promise<readonly ScoredChunk[]> {
    if (query.topK <= 0) return [];
    const scored: ScoredChunk[] = [];
    for (const row of this.#rows.values()) {
      if (!matchesFilters(row.chunk, query)) continue;
      scored.push({
        chunk: row.chunk,
        distance: cosineDistance(query.vector, row.embedding),
      });
    }
    scored.sort((left, right) => {
      if (left.distance !== right.distance) return left.distance - right.distance;
      // Deterministic tiebreak so a golden test cannot flake on equal distances.
      return left.chunk.id.localeCompare(right.chunk.id);
    });
    return scored.slice(0, query.limit);
  }

  async countChunks(): Promise<number> {
    return this.#rows.size;
  }

  async countDocuments(): Promise<number> {
    return this.#docs.size;
  }

  async deleteDocuments(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      await this.#purgeDocument(id);
    }
  }

  async deleteAll(): Promise<void> {
    this.#docs.clear();
    this.#groups.clear();
    this.#rows.clear();
  }

  async #purgeDocument(documentId: string): Promise<void> {
    this.#docs.delete(documentId);
    for (const [id, group] of [...this.#groups]) {
      if (group.documentId === documentId) this.#groups.delete(id);
    }
    for (const [id, row] of [...this.#rows]) {
      if (row.chunk.documentId === documentId) this.#rows.delete(id);
    }
  }
}
