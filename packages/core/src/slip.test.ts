import { describe, expect, it } from 'vitest';
import type { AgroStore, CaseData } from '@poultry/schemas';
import { buildReferralSlip, ESCALATE_SCRIPT } from './slip.js';

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
    status: 'in_progress',
    ...overrides,
  };
}

describe('ESCAPE_SCRIPT', () => {
  it('is a non-empty Pidgin safety directive', () => {
    expect(ESCALATE_SCRIPT.length).toBeGreaterThan(100);
    expect(ESCALATE_SCRIPT).toContain('separate the sick birds');
    expect(ESCALATE_SCRIPT).toContain('no sell or slaughter any sick bird');
  });
});

describe('buildReferralSlip', () => {
  it('produces the golden slip text for a known case (no store)', () => {
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
- The right medicine or vaccine for the symptoms above
- Dosage and days to give it — write it down

Buy medicine only inside a known agro-vet store.`);
  });

  it('embeds the store contact when provided', () => {
    const store: AgroStore = {
      id: 'e0e5f700-54ae-49e3-9b83-2d7a2e07f0c1',
      name: 'Adaeze Agro Vet',
      phone: '+2348012345678',
      state: 'Oyo',
      lga: 'Ibadan North',
      stock: ['vitamins'],
      isOpen: true,
      updatedAt: '2026-09-20T00:00:00.000Z',
    };
    const slip = buildReferralSlip(caseData(), store);
    expect(slip).toContain('Store: Adaeze Agro Vet');
    expect(slip).toContain('Phone: +2348012345678');
    expect(slip).toContain('LGA: Ibadan North, Oyo');
    expect(slip).toContain('Buy only at Adaeze Agro Vet and keep your receipt.');
  });
});