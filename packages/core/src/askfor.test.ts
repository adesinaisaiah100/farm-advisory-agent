import { describe, expect, it } from 'vitest';
import type { CaseData } from '@poultry/schemas';
import { askFor, COUNTERFEIT_GUARD } from './askfor.js';

function baseCase(overrides: Partial<CaseData> = {}): CaseData {
  return {
    species: 'broiler',
    symptoms: ['diarrhoea'],
    onsetDays: 2,
    mortalityCount: 3,
    farmSize: 500,
    status: 'in_progress',
    ...overrides,
  };
}

describe('askFor', () => {
  it('asks for an anticoccidial class, not a brand, when the differential says coccidiosis', () => {
    const ladder = askFor(
      baseCase({ symptoms: ['blood in droppings'], diseaseHits: ['coccidiosis'] }),
    );
    expect(ladder?.product).toContain('anticoccidial');
    expect(ladder?.needsVet).toBe(false);
  });

  it('asks the questions a counter cannot be trusted to volunteer', () => {
    const ladder = askFor(baseCase({ diseaseHits: ['coccidiosis'] }));
    const questions = ladder?.askTheSeller.join(' ') ?? '';
    expect(questions).toContain('per 100 birds');
    expect(questions).toContain('withdraw');
  });

  it('refuses a general antibiotic for every disease it will name', () => {
    for (const disease of ['coccidiosis', 'newcastle', 'gumboro', 'fowlpox'] as const) {
      const ladder = askFor(baseCase({ diseaseHits: [disease] }));
      expect(ladder?.refuse.join(' '), disease).toContain('antibiotic');
    }
  });

  it('always carries the counterfeit guard', () => {
    const ladder = askFor(baseCase({ diseaseHits: ['coccidiosis'] }));
    for (const guard of COUNTERFEIT_GUARD) {
      expect(ladder?.refuse).toContain(guard);
    }
  });

  it('marks a viral disease as needing a vet and says no antibiotic cures it', () => {
    const ladder = askFor(baseCase({ diseaseHits: ['newcastle'] }));
    expect(ladder?.needsVet).toBe(true);
    expect(ladder?.refuse.join(' ')).toContain('no antibiotic cures a virus');
  });

  it('sends suspected avian influenza to nobody: nothing to buy', () => {
    expect(askFor(baseCase({ diseaseHits: ['avian_influenza'] }))).toBeUndefined();
  });

  it('gives no product when the diagnosis is unknown', () => {
    expect(askFor(baseCase({ diseaseHits: ['unknown'] }))).toBeUndefined();
    expect(askFor(baseCase())).toBeUndefined();
  });

  it('tells the farmer to buy nothing yet when the two diseases need different drugs', () => {
    const ladder = askFor(baseCase({ diseaseHits: ['necrotic_enteritis'] }));
    expect(ladder?.product).toContain('nothing to buy yet');
    expect(ladder?.needsVet).toBe(true);
  });

  it('derives the ladder from the symptom signature when the model named nothing', () => {
    const ladder = askFor(baseCase({ symptoms: ['blood in droppings'] }));
    expect(ladder?.product).toContain('anticoccidial');
  });
});
