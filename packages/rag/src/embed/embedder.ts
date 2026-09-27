/**
 * The embedding seam. Every retrieval path depends on this interface, never on a
 * vendor SDK, so a unit test can hand the search half a fake embedder and assert
 * ranking behaviour with no network and no key.
 */
export const EMBED_DIMS = 768;

export const DEFAULT_EMBED_MODEL = 'gemini-embedding-001';

export type EmbedTaskType =
  | 'RETRIEVAL_DOCUMENT'
  | 'RETRIEVAL_QUERY'
  | 'SEMANTIC_SIMILARITY'
  | 'CLASSIFICATION';

export interface EmbedOptions {
  /**
   * Asymmetric retrieval only scores well when documents and the query are
   * embedded under their own task types, so this is a required decision at the
   * call site rather than a per-provider default.
   */
  taskType?: EmbedTaskType;
}

export interface Embedder {
  readonly dims: number;
  embed(texts: readonly string[], options?: EmbedOptions): Promise<readonly (readonly number[])[]>;
}

export class EmbedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbedError';
  }
}

export function l2Norm(vector: readonly number[]): number {
  let sum = 0;
  for (const value of vector) {
    sum += value * value;
  }
  return Math.sqrt(sum);
}

/**
 * `gemini-embedding-001` returns unit vectors at full width but NOT after MRL
 * truncation, so a 768-dim response arrives with a norm well below 1 (measured
 * 0.593 against a 3072-dim baseline of 1.0). Normalizing makes stored vectors
 * canonical so a distance stays comparable no matter which operator reads them.
 *
 * Measured on pgvector 0.8.6: the cosine operator `<=>` is scale-invariant, so
 * normalization does not change cosine *ranking*. It does change `<->` (L2) and
 * `<#>` (inner product), which is why we normalize on write rather than depend
 * on the current operator staying cosine.
 */
export function l2Normalize(vector: readonly number[]): number[] {
  if (vector.length === 0) {
    throw new EmbedError('cannot normalize an empty vector');
  }
  const norm = l2Norm(vector);
  // A zero vector has no direction, so there is nothing to normalize. Failing
  // loudly beats storing a zero vector that every query would match equally.
  if (!Number.isFinite(norm) || norm === 0) {
    throw new EmbedError(`cannot normalize a vector with norm ${norm}`);
  }
  return vector.map((value) => value / norm);
}

export function assertDims(
  vector: readonly number[],
  expected: number,
  label: string,
): void {
  if (vector.length !== expected) {
    throw new EmbedError(`${label} has ${vector.length} dims, expected ${expected}`);
  }
}
