import type { CaseData, Disease } from '@poultry/schemas';
import { assessTriage } from './triage.js';

export interface Citation {
  source: string;
  locator?: string;
}

export interface LadderEvidence {
  agreement: number;
  citations: readonly Citation[];
}

export interface ClinicalLadder {
  disease: Disease;
  productClass: string;
  why: string;
  askTheSeller: readonly string[];
  needsVet: boolean;
  evidence: LadderEvidence;
}

export interface ClinicalLadderSource {
  retrieve(c: CaseData): Promise<ClinicalLadder | undefined>;
}

export type PrescriberRole =
  | 'veterinarian'
  | 'veterinary_paraprofessional'
  | 'animal_health_technologist';

export const AGREEMENT_FLOOR = 0.6;

export const MIN_CITATIONS = 2;

export const COUNTERFEIT_GUARD: readonly string[] = [
  'anything without a NAFDAC number printed on the pack',
  'medicine decanted into a loose unlabelled bottle',
  'a sale with no written receipt, because you cannot trace a bad batch',
];

export const RESISTANCE_WARNING =
  'a general antibiotic "just in case" — resistance is documented in Nigerian poultry, and it does not treat this';

export const VIRUS_REFUSAL =
  'an antibiotic sold as a cure for a virus — no antibiotic cures a virus, it only hides secondary infection';

export const UNDOSED_FEED_REFUSAL =
  'a coccidial or antibiotic mixed into the feed with no stated dose';

export const VACCINE_COLD_CHAIN =
  'a vaccine kept out of the cold chain — a bad vaccine is worse than no vaccine';

// Refusing is never harmful, so these stay in code as permanent policy and never depend
// on retrieval succeeding. Only the treatment ladder itself is retrieved.
export const POLICY_REFUSALS: readonly string[] = [
  RESISTANCE_WARNING,
  VIRUS_REFUSAL,
  UNDOSED_FEED_REFUSAL,
  VACCINE_COLD_CHAIN,
  ...COUNTERFEIT_GUARD,
];

export interface LadderGate {
  permitted: boolean;
  reasons: readonly string[];
}

const NO_PRODUCT_SAFETY =
  'this case has a warning sign that needs a vet, so I will not name a product';
const NO_PRODUCT_AMBIGUOUS =
  'two diseases need different treatment, so I will not name a product until a vet separates them';
const NO_PRODUCT_UNRETRIEVED =
  'I have no verified medicine information for this case yet';
const NO_PRODUCT_DISAGREEMENT = 'the sources do not agree on the treatment';
const NO_PRODUCT_UNUSABLE = 'the medicine information I received could not be checked';

function usableAgreement(agreement: number): boolean {
  return Number.isFinite(agreement) && agreement >= 0 && agreement <= 1;
}

function independentSources(ladder: ClinicalLadder): number {
  return new Set(ladder.evidence.citations.map((citation) => citation.source)).size;
}

export function gateLadder(c: CaseData, ladder: ClinicalLadder | undefined): LadderGate {
  const triage = assessTriage(c);

  if (triage.band === 'red_flag') {
    return { permitted: false, reasons: [NO_PRODUCT_SAFETY] };
  }
  if (triage.band === 'ambiguous') {
    return { permitted: false, reasons: [NO_PRODUCT_AMBIGUOUS] };
  }
  if (ladder === undefined) {
    return { permitted: false, reasons: [NO_PRODUCT_UNRETRIEVED] };
  }

  const reasons: string[] = [];
  if (!usableAgreement(ladder.evidence.agreement)) {
    reasons.push(NO_PRODUCT_UNUSABLE);
  } else if (ladder.evidence.agreement < AGREEMENT_FLOOR) {
    reasons.push(NO_PRODUCT_DISAGREEMENT);
  }
  const independent = independentSources(ladder);
  if (independent < MIN_CITATIONS) {
    reasons.push(
      `I need ${MIN_CITATIONS} independent sources before naming a medicine, and I have ${independent}`,
    );
  }
  return { permitted: reasons.length === 0, reasons };
}
