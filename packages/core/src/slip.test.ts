import { describe, expect, it } from 'vitest';
import type { AgroStore, CaseData } from '@poultry/schemas';
import {
  buildReferralSlip,
  ESCALATE_SCRIPT,
  ESCALATE_SCRIPT_EN,
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

const VERIFIED_STORE: AgroStore = {
  id: 'e0e5f700-54ae-49e3-9b83-2d7a2e07f0c1',
  name: 'Adaeze Agro Vet',
  phone: '+2348012345678',
  state: 'Oyo',
  lga: 'Ibadan North',
  stock: ['vitamins'],
  stockVerifiedAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-20T00:00:00.000Z',
};

describe('ESCAPE_SCRIPT', () => {
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
  it('produces the golden slip text for a coccidiosis case (no store)', () => {
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
- an anticoccidial — ask whether it is amprolium or diclazuril, not an antibiotic
  Why: blood-stained droppings in young birds fit coccidiosis, and an anticoccidial is the class that treats it
- Ask: which one is it, and how much per 100 birds at this weight?
- Ask: how many days do I withdraw before I eat the eggs or sell the birds?
- Ask: is the batch registered with NAFDAC, and what is the expiry date?

DO NOT ACCEPT:
- a coccidial mixed into the feed with no stated dose
- a general antibiotic "just in case" — resistance is documented in Nigerian poultry, and it does not treat this
- anything without a NAFDAC number printed on the pack
- medicine decanted into a loose unlabelled bottle
- a sale with no written receipt, because you cannot trace a bad batch

Buy medicine only inside a known agro-vet store.`);
  });

  it('never tells the farmer to ask for "the right medicine"', () => {
    for (const disease of ['coccidiosis', 'newcastle', 'gumboro', 'unknown'] as const) {
      const slip = buildReferralSlip(caseData({ diseaseHits: [disease] }));
      expect(slip, disease).not.toContain('The right medicine');
    }
  });

  it('tells the farmer a viral case needs a vet to administer the vaccine', () => {
    const slip = buildReferralSlip(caseData({ diseaseHits: ['newcastle'] }));
    expect(slip).toContain('DO NOT ACCEPT:');
    expect(slip).toContain('no antibiotic cures a virus');
    expect(slip).toContain('A vet must confirm or administer this one.');
  });

  it('still gives the guard list when the diagnosis is unknown', () => {
    const slip = buildReferralSlip(caseData({ diseaseHits: ['unknown'] }));
    expect(slip).toContain('I will not name a drug without a diagnosis');
    expect(slip).toContain('NAFDAC number');
  });

  it('embeds the store contact when provided', () => {
    const slip = buildReferralSlip(caseData(), VERIFIED_STORE);
    expect(slip).toContain('Store: Adaeze Agro Vet');
    expect(slip).toContain('Phone: +2348012345678');
    expect(slip).toContain('LGA: Ibadan North, Oyo');
    expect(slip).toContain('Buy only at Adaeze Agro Vet and keep your receipt.');
  });
});

describe('verifiedStockNote', () => {
  it('reports a partner-confirmed stock list with its date', () => {
    expect(verifiedStockNote(VERIFIED_STORE)).toBe(
      'They confirmed on 2026-09-24 that they stock: vitamins.',
    );
  });

  it('admits ignorance instead of guessing when nothing was confirmed', () => {
    const unverified: AgroStore = {
      ...VERIFIED_STORE,
      stock: undefined,
      stockVerifiedAt: undefined,
    };
    expect(verifiedStockNote(unverified)).toBe(
      'We do not know what they stock today, so ask them.',
    );
  });
});
