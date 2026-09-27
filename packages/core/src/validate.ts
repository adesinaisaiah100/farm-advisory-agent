import type { CaseData, CaseStatus, Door } from '@poultry/schemas';
import { isComplete, missing } from './missing.js';
import { assessTriage, MASS_MORTALITY_PCT, MAX_TRIAGE_TURNS } from './triage.js';

export { MASS_MORTALITY_PCT };

// 'collect' and 'triage' are transitional routing states inside a turn, not outcomes a case
// reaches, so only the four terminal doors are persisted on CaseData.door.
export type EffectiveDoor = Door | 'collect' | 'triage';

export interface DoorDecision {
  door: EffectiveDoor;
  caseStatus: CaseStatus;
  reasons: string[];
  missingFields: string[];
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

function safetyReasons(c: CaseData, redFlags: string[], notifiable: boolean): string[] {
  const reasons: string[] = [];
  for (const flag of redFlags) reasons.push(`red flag: ${flag}`);
  if (notifiable) reasons.push('suspected avian influenza (notifiable)');
  const rate = mortalityRate(c);
  if (rate !== undefined && rate >= MASS_MORTALITY_PCT) reasons.push('mass mortality');
  return reasons;
}

export function validateCase(c: CaseData, wantsSupply: boolean): DoorDecision {
  const triage = assessTriage(c);
  const notifiable = triage.differential.includes('avian_influenza');

  const safety = safetyReasons(c, triage.redFlags, notifiable);
  if (safety.length > 0) {
    return { door: 'escalate', caseStatus: 'escalated', reasons: safety, missingFields: [] };
  }

  const missingFields = missing(c);
  if (!isComplete(c)) {
    return { door: 'collect', caseStatus: 'in_progress', reasons: [], missingFields };
  }

  if (triage.band === 'ambiguous') {
    const triageTurns = c.triageTurns ?? 0;
    if (triageTurns >= MAX_TRIAGE_TURNS) {
      return {
        door: 'escalate',
        caseStatus: 'escalated',
        reasons: [`still ambiguous after ${triageTurns} discriminating questions`],
        missingFields: [],
      };
    }
    const lead = triage.differential[0];
    return {
      door: 'triage',
      caseStatus: 'in_progress',
      reasons: [
        triage.pairedWith !== undefined && lead !== undefined
          ? `cannot separate ${lead} from ${triage.pairedWith}`
          : 'not confident in the diagnosis',
      ],
      missingFields: [],
    };
  }

  if (wantsSupply) {
    return {
      door: 'supply',
      caseStatus: 'complete',
      reasons: ['farmer asked to buy'],
      missingFields: [],
    };
  }

  return {
    door: 'resolve',
    caseStatus: 'complete',
    reasons: ['case complete and safe'],
    missingFields: [],
  };
}
