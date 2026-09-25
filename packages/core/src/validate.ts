import type { CaseData, CaseStatus } from '@poultry/schemas';
import { hasCriticalSymptom } from '@poultry/schemas';
import { isComplete, missing } from './missing.js';

export const MASS_MORTALITY_PCT = 30;

export type EffectiveDoor = 'resolve' | 'supply' | 'escalate' | 'report' | 'collect';

export interface DoorDecision {
  door: EffectiveDoor;
  caseStatus: CaseStatus;
  reasons: string[];
  missingFields: string[];
}

function needsEscalation(c: CaseData): string[] {
  const reasons: string[] = [];
  if (hasCriticalSymptom(c)) reasons.push('critical symptom');
  if (c.diseaseHits?.includes('avian_influenza')) reasons.push('suspected avian influenza (notifiable)');
  const rate = mortalityRate(c);
  if (rate !== undefined && rate >= MASS_MORTALITY_PCT) reasons.push('mass mortality');
  return reasons;
}

export function mortalityRate(c: CaseData): number | undefined {
  if (c.mortalityRatePct !== undefined) return c.mortalityRatePct;
  if (c.mortalityCount !== undefined && c.farmSize !== undefined && c.farmSize > 0) {
    return (c.mortalityCount / c.farmSize) * 100;
  }
  return undefined;
}

export function hasReportableSignal(c: CaseData): boolean {
  return (c.symptoms?.length ?? 0) > 0 && c.species !== undefined && c.species !== 'unknown';
}

export function validateCase(c: CaseData, wantsSupply: boolean): DoorDecision {
  const safety = needsEscalation(c);
  if (safety.length > 0) {
    return { door: 'escalate', caseStatus: 'escalated', reasons: safety, missingFields: [] };
  }
  const missingFields = missing(c);
  if (!isComplete(c)) {
    return { door: 'collect', caseStatus: 'in_progress', reasons: [], missingFields };
  }
  if (wantsSupply) {
    return { door: 'supply', caseStatus: 'complete', reasons: ['farmer asked to buy'], missingFields: [] };
  }
  return { door: 'resolve', caseStatus: 'complete', reasons: ['case complete and safe'], missingFields: [] };
}