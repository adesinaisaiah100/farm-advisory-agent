import type { CaseData, Disease, Species } from '@poultry/schemas';
import type { SectionKind, SourceSpecies } from '../schema.js';

/**
 * Stage B restricts to the sections that can actually carry a treatment. A
 * disease_signs chunk is useful context but it can never fill the ladder, so
 * letting it consume the top-k would starve the one thing the supply door needs.
 */
export const TREATMENT_SECTIONS: readonly SectionKind[] = [
  'disease_treatment',
  'drug_monograph',
  'antimicrobial_stewardship',
];

const SPECIES_TO_CORPUS: Record<Exclude<Species, 'unknown' | 'mixed'>, SourceSpecies> = {
  broiler: 'broiler',
  layer: 'layer',
  cockerel: 'cockerel',
};

export function corpusSpeciesFor(species: Species | undefined): readonly SourceSpecies[] {
  // 'mixed' has no single corpus species and 'unknown' means we were never told,
  // so both return no filter rather than guessing one that would drop real hits.
  if (species === undefined || species === 'unknown' || species === 'mixed') return [];
  return [SPECIES_TO_CORPUS[species]];
}

export interface RetrievalPolicy {
  readonly topK: number;
  readonly maxPerGroup: number;
  readonly candidateOversample: number;
  /** Below this many filtered hits, drop the filters and search purely by vector. */
  readonly starvationFloor: number;
}

export const DEFAULT_POLICY: RetrievalPolicy = {
  topK: 8,
  maxPerGroup: 2,
  candidateOversample: 3,
  starvationFloor: 2,
};

export interface SearchPlan {
  readonly queryText: string;
  readonly species: readonly SourceSpecies[];
  readonly diseases: readonly Disease[];
  readonly sections: readonly SectionKind[];
  readonly topK: number;
  readonly limit: number;
}

function usableDiseases(c: CaseData): readonly Disease[] {
  // 'unknown' is the absence of a diagnosis, so filtering on it would only ever
  // match chunks that are equally unsure. It stays out of the filter and is
  // carried by the vector instead.
  return (c.diseaseHits ?? []).filter((disease) => disease !== 'unknown');
}

/**
 * The text that gets embedded. Deterministic and free: symptoms, the farmer's own
 * disease words, and the triage disease hits. A separate LLM call here would cost
 * a round trip on the hot path to produce a string we can assemble exactly.
 */
export function queryTextFor(c: CaseData): string {
  const parts: string[] = [];
  if (c.species !== undefined) parts.push(c.species);
  if (c.breed !== undefined) parts.push(c.breed);
  if (c.diseaseText !== undefined) parts.push(c.diseaseText);
  parts.push(...usableDiseases(c).map((disease) => disease.replace(/_/g, ' ')));
  parts.push(...(c.symptoms ?? []));
  const text = parts.join(' ').trim();
  if (text.length === 0) {
    throw new Error('case carries no text to embed; nothing to retrieve against');
  }
  return text;
}

export function buildSearchPlan(c: CaseData, policy: RetrievalPolicy = DEFAULT_POLICY): SearchPlan {
  if (policy.topK <= 0) throw new Error(`topK must be positive, got ${policy.topK}`);
  return {
    queryText: queryTextFor(c),
    species: corpusSpeciesFor(c.species),
    diseases: usableDiseases(c),
    sections: TREATMENT_SECTIONS,
    topK: policy.topK,
    limit: policy.topK * policy.candidateOversample,
  };
}
