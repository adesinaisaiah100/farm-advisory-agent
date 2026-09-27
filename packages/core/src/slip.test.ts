import { describe, expect, it } from 'vitest';
import type { AgroStore, CaseData } from '@poultry/schemas';
import type { ClinicalLadder } from './askfor.js';
import {
  buildPrescriberBrief,
  buildReferralSlip,
  ESCALATE_SCRIPT,
  ESCALATE_SCRIPT_EN,
  askForBlock,
  renderPrescriberBrief,
  verifiedStockNote,
} from './slip.js';

function caseData(overrides: Partial<CaseData> = {}): CaseData {
  return {
    species: 'broiler',
    breed: 'marshal',
    birdStage: 'finisher',
    onsetDays: 2,
    symptoms: ['diarrhoea', 'ruffled feathers'],
    mortalityCount: 5,
    farmSize: 500,
    diseaseText: 'coccidiosis',
    diseaseHits: ['coccidiosis'],
    status: 'in_progress',
    ...overrides,
  };
}

const LADDER: ClinicalLadder = {
  disease: 'coccidiosis',
  productClass: 'an anticoccidial — amprolium or diclazuril, not an antibiotic',
  why: 'blood-stained droppings in young birds fit coccidiosis',
  askTheSeller: ['which one is it, and how much per 100 birds at this weight?'],
  needsVet: false,
  evidence: {
    agreement: 0.8,
    citations: [
      { source: 'MSD Veterinary Manual', locator: 'Coccidiosis, poultry' },
      { source: 'Nigerian Journal of Animal Science', locator: '2023 trial' },
    ],
  },
};

const PARTNER_STORE: AgroStore = {
  id: 'e0e5f700-54ae-49e3-9b83-2d7a2e07f0c1',
  name: 'Adaeze Agro Vet',
  phone: '+2348012345678',
  state: 'Oyo',
  lga: 'Ibadan North',
  stock: ['vitamins'],
  stockVerifiedAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-20T00:00:00.000Z',
};

describe('ESCALATE_SCRIPT', () => {
  it('is a non-empty Pidgin safety directive', () => {
    expect(ESCALATE_SCRIPT.length).toBeGreaterThan(100);
    expect(ESCALATE_SCRIPT).toContain('separate the sick birds');
    expect(ESCALATE_SCRIPT).toContain('no sell or slaughter any sick bird');
  });

  it('has an English variant covering the same rules', () => {
    expect(ESCALATE_SCRIPT_EN.length).toBeGreaterThan(100);
    expect(ESCALATE_SCRIPT_EN).toContain('Do not sell or slaughter any sick bird');
  });
});

describe('buildReferralSlip', () => {
  it('produces the golden slip text when no medicine information was retrieved', () => {
    const slip = buildReferralSlip(caseData());
    expect(slip).toBe(`CONTACT THIS AGRO-VET STORE
EVERY DAY OF DELAY COST YOU BIRDS.

TELL THEM WHAT YOU SEE:
- Bird: broiler
- Breed: marshal
- Stage: finisher
- Sick birds since: 2 day(s)
- Symptoms: diarrhoea, ruffled feathers
- Deaths so far: 5
- Mortality rate: 1.0%
- Suspected: coccidiosis

ASK THEM FOR:
- The treatment the agro-vet names for the signs above — I will not name a drug without a confirmed diagnosis
  I have no verified medicine information for this case yet

DO NOT ACCEPT:
- a general antibiotic "just in case" — resistance is documented in Nigerian poultry, and it does not treat this
- an antibiotic sold as a cure for a virus — no antibiotic cures a virus, it only hides secondary infection
- a coccidial or antibiotic mixed into the feed with no stated dose
- a vaccine kept out of the cold chain — a bad vaccine is worse than no vaccine
- anything without a NAFDAC number printed on the pack
- medicine decanted into a loose unlabelled bottle
- a sale with no written receipt, because you cannot trace a bad batch

Buy medicine only inside a known agro-vet store.`);
  });

  it('still gives the refusal list when the diagnosis is unknown', () => {
    const slip = buildReferralSlip(caseData({ diseaseHits: ['unknown'] }));
    expect(slip).toContain('I will not name a drug without a confirmed diagnosis');
    expect(slip).toContain('NAFDAC number');
  });

  it('names no product while two diseases need different treatment', () => {
    const slip = buildReferralSlip(
      caseData({ diseaseHits: ['coccidiosis', 'necrotic_enteritis'] }),
      undefined,
      LADDER,
    );
    expect(slip).not.toContain('amprolium');
    expect(slip).toContain('two diseases need different treatment');
  });

  it('never tells the farmer to ask for "the right medicine"', () => {
    for (const disease of ['coccidiosis', 'newcastle', 'gumboro', 'unknown'] as const) {
      const slip = buildReferralSlip(caseData({ diseaseHits: [disease] }));
      expect(slip, disease).not.toContain('The right medicine');
    }
  });

  it('embeds the store contact when provided', () => {
    const slip = buildReferralSlip(caseData(), PARTNER_STORE);
    expect(slip).toContain('Store: Adaeze Agro Vet');
    expect(slip).toContain('Phone: +2348012345678');
    expect(slip).toContain('LGA: Ibadan North, Oyo');
    expect(slip).toContain('Buy only at Adaeze Agro Vet and keep your receipt.');
  });
});

describe('askForBlock', () => {
  it('produces the golden ask block when the ladder clears the gate', () => {
    expect(askForBlock(caseData(), LADDER).join('\n')).toBe(`ASK THEM FOR:
- an anticoccidial — amprolium or diclazuril, not an antibiotic
  Why: blood-stained droppings in young birds fit coccidiosis
- Ask: which one is it, and how much per 100 birds at this weight?

DO NOT ACCEPT:
- a general antibiotic "just in case" — resistance is documented in Nigerian poultry, and it does not treat this
- an antibiotic sold as a cure for a virus — no antibiotic cures a virus, it only hides secondary infection
- a coccidial or antibiotic mixed into the feed with no stated dose
- a vaccine kept out of the cold chain — a bad vaccine is worse than no vaccine
- anything without a NAFDAC number printed on the pack
- medicine decanted into a loose unlabelled bottle
- a sale with no written receipt, because you cannot trace a bad batch`);
  });

  it('keeps the source list and agreement score off the farmer slip', () => {
    const block = askForBlock(caseData(), LADDER).join('\n');
    expect(block).not.toContain('MSD Veterinary Manual');
    expect(block).not.toContain('0.80');
  });

  it('tells the farmer a vet must administer when the retrieved ladder says so', () => {
    const viral = {
      ...LADDER,
      disease: 'newcastle' as const,
      productClass: 'a Newcastle vaccine',
      needsVet: true,
    };
    expect(askForBlock(caseData({ diseaseHits: ['newcastle'] }), viral).join('\n')).toContain(
      'A vet must confirm or administer this one.',
    );
  });
});

describe('renderPrescriberBrief', () => {
  it('produces the golden brief for a qualified recipient', () => {
    const brief = buildPrescriberBrief(caseData(), 'veterinary_paraprofessional', LADDER);
    expect(renderPrescriberBrief(brief)).toBe(
      `POULTRY CASE BRIEF — DECISION SUPPORT, NOT A PRESCRIPTION
Prepared for: veterinary_paraprofessional
Case: broiler | finisher | 2d onset | 5 dead | symptoms: diarrhoea, ruffled feathers

DIFFERENTIALS:
1. coccidiosis — sources agree 0.80 (not a diagnosis)

CANDIDATE PRODUCT CLASS:
- an anticoccidial — amprolium or diclazuril, not an antibiotic
  Why: blood-stained droppings in young birds fit coccidiosis
- Ask: which one is it, and how much per 100 birds at this weight?

SOURCES:
- MSD Veterinary Manual, Coccidiosis, poultry
- Nigerian Journal of Animal Science, 2023 trial

TO CONFIRM:
  To settle it, do a post-mortem on the bird that died most recently and keep the body cool, or send a photo of fresh droppings on white paper. A vet, or the NVRI laboratory in Vom, can confirm from that.

Decision support from retrieved sources. Not a prescription and not a diagnosis. Confirm against your own examination before treating, and apply withdrawal periods.`,
    );
  });

  it('withholds the product class and says why when nothing was retrieved', () => {
    const brief = buildPrescriberBrief(caseData(), 'veterinarian');
    const text = renderPrescriberBrief(brief);
    expect(text).toContain('CANDIDATE PRODUCT CLASS: withheld');
    expect(text).toContain('no verified medicine information');
    expect(text).not.toContain('amprolium');
  });

  it('shows an agreement score only for the disease retrieval actually covered', () => {
    const brief = buildPrescriberBrief(
      caseData({ diseaseHits: ['coccidiosis', 'gumboro'] }),
      'animal_health_technologist',
      LADDER,
    );
    const text = renderPrescriberBrief(brief);
    expect(text).toContain('1. coccidiosis — sources agree 0.80 (not a diagnosis)');
    expect(text).toContain('2. gumboro — no retrieved evidence');
  });

  it('never presents the agreement score as a diagnosis', () => {
    const brief = buildPrescriberBrief(caseData(), 'veterinarian', LADDER);
    const text = renderPrescriberBrief(brief);
    expect(text).toContain('not a diagnosis');
    expect(text).toContain('Not a prescription');
  });
});

describe('verifiedStockNote', () => {
  it('reports a partner-confirmed stock list with its date', () => {
    expect(verifiedStockNote(PARTNER_STORE)).toBe(
      'They confirmed on 2026-09-24 that they stock: vitamins.',
    );
  });

  it('admits ignorance instead of guessing when nothing was confirmed', () => {
    const unverified: AgroStore = {
      ...PARTNER_STORE,
      stock: undefined,
      stockVerifiedAt: undefined,
    };
    expect(verifiedStockNote(unverified)).toBe(
      'We do not know what they stock today, so ask them.',
    );
  });
});
