import type { CaseData, Disease } from '@poultry/schemas';
import type { Citation, ClinicalLadder, ClinicalLadderSource } from '@poultry/core';
import type { Embedder } from '../embed/embedder.js';
import type { Chunk } from '../schema.js';
import {
  DEFAULT_POLICY,
  buildSearchPlan,
  type RetrievalPolicy,
} from './plan.js';
import { applyDiversityCap, independentSources, isStarved } from './select.js';
import type { ScoredChunk, VectorStore } from './store.js';

export type RetrievalStage = 'filtered' | 'starvation_fallback';

export interface RetrievalResult {
  readonly rows: readonly ScoredChunk[];
  readonly stage: RetrievalStage;
  /** How many rows the filtered pass found before the fallback decision. */
  readonly filteredCount: number;
  readonly starved: boolean;
}

export interface RagSearchDeps {
  readonly embedder: Embedder;
  readonly store: VectorStore;
  readonly policy?: RetrievalPolicy;
}

export async function searchChunks(
  c: CaseData,
  deps: RagSearchDeps,
): Promise<RetrievalResult> {
  const policy = deps.policy ?? DEFAULT_POLICY;
  const plan = buildSearchPlan(c, policy);

  // The query is embedded under RETRIEVAL_QUERY and documents under
  // RETRIEVAL_DOCUMENT; mixing the two quietly costs recall.
  const [vector] = await deps.embedder.embed([plan.queryText], { taskType: 'RETRIEVAL_QUERY' });
  if (vector === undefined) {
    throw new Error('embedder returned no vector for the query');
  }

  const filtered = await deps.store.search({
    vector,
    topK: plan.topK,
    limit: plan.limit,
    species: plan.species,
    diseases: plan.diseases,
    sections: plan.sections,
  });

  const starved = isStarved(filtered.length, policy.starvationFloor);
  // Starvation drops the filters rather than returning nothing. A wrong species
  // guess or a missing disease hit must not be able to hide real evidence, and
  // the gate downstream still refuses on agreement and citation count.
  const candidates = starved
    ? await deps.store.search({ vector, topK: plan.topK, limit: plan.limit })
    : filtered;

  return {
    rows: applyDiversityCap(candidates, plan.topK, policy.maxPerGroup),
    stage: starved ? 'starvation_fallback' : 'filtered',
    filteredCount: filtered.length,
    starved,
  };
}

interface ProductTally {
  readonly productClass: string;
  readonly sources: Set<string>;
  bestDistance: number;
  bestRow: ScoredChunk;
}

function tallyTreatments(rows: readonly ScoredChunk[]): {
  readonly tallies: ProductTally[];
  readonly totalSources: number;
} {
  const byClass = new Map<string, ProductTally>();
  const allSources = new Set<string>();

  for (const row of rows) {
    const treatment = row.chunk.treatment;
    if (treatment === undefined) continue;
    allSources.add(row.chunk.source);
    const existing = byClass.get(treatment.productClass);
    if (existing === undefined) {
      byClass.set(treatment.productClass, {
        productClass: treatment.productClass,
        sources: new Set([row.chunk.source]),
        bestDistance: row.distance,
        bestRow: row,
      });
      continue;
    }
    existing.sources.add(row.chunk.source);
    if (row.distance < existing.bestDistance) {
      existing.bestDistance = row.distance;
      existing.bestRow = row;
    }
  }

  const tallies = [...byClass.values()].sort((left, right) => {
    // Most independent sources win. Ties break on the best single distance, then
    // on the name, so the choice never depends on Map iteration order.
    if (right.sources.size !== left.sources.size) return right.sources.size - left.sources.size;
    if (left.bestDistance !== right.bestDistance) return left.bestDistance - right.bestDistance;
    return left.productClass.localeCompare(right.productClass);
  });

  return { tallies, totalSources: allSources.size };
}

function pickDisease(c: CaseData, row: Chunk): Disease | undefined {
  const fromCase = (c.diseaseHits ?? []).find((disease) => disease !== 'unknown');
  if (fromCase !== undefined) return fromCase;
  return row.diseases.find((disease) => disease !== 'unknown');
}

export interface LadderRetrieval {
  readonly ladder: ClinicalLadder | undefined;
  readonly result: RetrievalResult;
  /** Sources supporting the winning product class, for logging and tests. */
  readonly supportingSources: number;
  readonly totalSources: number;
}

/**
 * Builds the ladder the Phase 2.6 gate consumes.
 *
 * Agreement is the share of independent sources that name the winning product
 * class, not a model confidence score. It is computed from citations we can point
 * at, so a disagreement between sources shows up as a number below the floor
 * instead of a confident sentence.
 */
export function ladderFromRows(
  c: CaseData,
  result: RetrievalResult,
): LadderRetrieval {
  const withTreatment = result.rows.filter((row) => row.chunk.treatment !== undefined);
  if (withTreatment.length === 0) {
    return { ladder: undefined, result, supportingSources: 0, totalSources: 0 };
  }

  const { tallies, totalSources } = tallyTreatments(withTreatment);
  const winner = tallies[0];
  if (winner === undefined || totalSources === 0) {
    return { ladder: undefined, result, supportingSources: 0, totalSources };
  }

  const disease = pickDisease(c, winner.bestRow.chunk);
  if (disease === undefined) {
    // Without a disease the ladder has no subject, and guessing one is how a
    // farmer ends up with the wrong drug.
    return { ladder: undefined, result, supportingSources: winner.sources.size, totalSources };
  }

  const supportingRows = withTreatment.filter(
    (row) => row.chunk.treatment?.productClass === winner.productClass,
  );
  const citations: Citation[] = independentSources(supportingRows).map((entry) => ({
    source: entry.source,
    locator: entry.locator,
  }));
  const treatment = winner.bestRow.chunk.treatment;

  return {
    ladder: {
      disease,
      productClass: treatment?.productClass ?? winner.productClass,
      why: treatment?.why ?? '',
      askTheSeller: treatment?.askTheSeller ?? [],
      needsVet: treatment?.needsVet ?? true,
      evidence: {
        agreement: winner.sources.size / totalSources,
        citations,
      },
    },
    result,
    supportingSources: winner.sources.size,
    totalSources,
  };
}

export class RagClinicalLadderSource implements ClinicalLadderSource {
  readonly #deps: RagSearchDeps;

  constructor(deps: RagSearchDeps) {
    this.#deps = deps;
  }

  async retrieve(c: CaseData): Promise<ClinicalLadder | undefined> {
    const result = await searchChunks(c, this.#deps);
    return ladderFromRows(c, result).ladder;
  }
}

/**
 * Retrieved regions rendered for the chat context, each line carrying the source
 * and locator so a claim in the reply can be traced back to a page.
 */
export function renderRetrievalContext(rows: readonly ScoredChunk[]): string {
  return rows
    .map((row) => {
      const treatment = row.chunk.treatment;
      const product =
        treatment === undefined
          ? ''
          : ` [product class: ${treatment.productClass}; needs vet: ${String(treatment.needsVet)}]`;
      return `- (${row.chunk.source}, ${row.chunk.locator}) ${row.chunk.text.trim()}${product}`;
    })
    .join('\n');
}
