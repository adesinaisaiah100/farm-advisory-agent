import type { ScoredChunk } from './store.js';

export function isStarved(count: number, starvationFloor: number): boolean {
  return count < starvationFloor;
}

/**
 * Keeps at most `maxPerGroup` chunks from any one section.
 *
 * A single long treatment section micro-chunks into many near-identical vectors,
 * and without this cap it fills the whole top-k on its own. Then the farmer is
 * shown one source's paragraph several times and the two-independent-source gate
 * counts the repetitions as corroboration, which is exactly the failure the
 * Phase 2.6 gate exists to prevent.
 */
export function applyDiversityCap(
  rows: readonly ScoredChunk[],
  topK: number,
  maxPerGroup: number,
): ScoredChunk[] {
  if (maxPerGroup <= 0) throw new Error(`maxPerGroup must be positive, got ${maxPerGroup}`);
  const perGroup = new Map<string, number>();
  const kept: ScoredChunk[] = [];
  for (const row of rows) {
    if (kept.length >= topK) break;
    const seen = perGroup.get(row.chunk.groupId) ?? 0;
    if (seen >= maxPerGroup) continue;
    perGroup.set(row.chunk.groupId, seen + 1);
    kept.push(row);
  }
  return kept;
}

export interface IndependentSource {
  readonly source: string;
  readonly locator: string;
}

/**
 * Distinct sources behind a set of rows, best-ranked first, so citations do not
 * repeat one document twice.
 */
export function independentSources(rows: readonly ScoredChunk[]): readonly IndependentSource[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (!seen.has(row.chunk.source)) {
      seen.set(row.chunk.source, row.chunk.locator);
    }
  }
  return [...seen].map(([source, locator]) => ({ source, locator }));
}
