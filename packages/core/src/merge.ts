import type { CaseData } from '@poultry/schemas';
import type { CaseDelta } from './llm.js';

export type CaseField = keyof CaseData;

const SCALAR_FIELDS: readonly CaseField[] = [
  'species',
  'breed',
  'birdStage',
  'farmSize',
  'flockAgeWeeks',
  'onsetDays',
  'mortalityCount',
  'mortalityRatePct',
  'diseaseText',
  'needsConfirmation',
];

const ARRAY_FIELDS: readonly CaseField[] = ['symptoms', 'diseaseHits'];

const CASE_KEYS: ReadonlySet<CaseField> = new Set<CaseField>([...SCALAR_FIELDS, ...ARRAY_FIELDS]);

export function mergeDelta(caseData: CaseData, delta: CaseDelta): CaseData {
  const next: CaseData = { ...caseData };
  for (const field of CASE_KEYS) {
    const value: unknown = delta[field as keyof CaseDelta];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) (next as Record<string, unknown>)[field] = value;
    } else {
      (next as Record<string, unknown>)[field] = value;
    }
  }
  return next;
}

export function caseKeys(): readonly CaseField[] {
  return [...CASE_KEYS];
}