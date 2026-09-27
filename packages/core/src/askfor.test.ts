import { describe, expect, it } from 'vitest';
import type { CaseData } from '@poultry/schemas';
import type { ClinicalLadder } from './askfor.js';
import {
  AGREEMENT_FLOOR,
  COUNTERFEIT_GUARD,
  gateLadder,
  MIN_CITATIONS,
  POLICY_REFUSALS,
} from './askfor.js';

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

const COCCI_CASIS: Partial<CaseData> = {
  symptoms: ['blood in droppings'],
  diseaseHits: ['coccidiosis'],
};

function ladder(overrides: Partial<ClinicalLadder> = {}): ClinicalLadder {
  return {
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
    ...overrides,
  };
}

describe('gateLadder', () => {
  it('permits a product class when triage is confirmable and the sources agree', () => {
    const gate = gateLadder(baseCase(COCCI_CASIS), ladder());
    expect(gate.permitted).toBe(true);
    expect(gate.reasons).toEqual([]);
  });

  it('names no product while two diseases need different treatment', () => {
    const gate = gateLadder(
      baseCase({ diseaseHits: ['coccidiosis', 'necrotic_enteritis'] }),
      ladder(),
    );
    expect(gate.permitted).toBe(false);
    expect(gate.reasons[0]).toContain('two diseases need different treatment');
  });

  it('names no product on a red flag even when strong evidence was retrieved', () => {
    const gate = gateLadder(baseCase({ symptoms: ['sudden death'] }), ladder());
    expect(gate.permitted).toBe(false);
    expect(gate.reasons[0]).toContain('warning sign');
  });

  it('names no product when nothing was retrieved', () => {
    const gate = gateLadder(baseCase(COCCI_CASIS), undefined);
    expect(gate.permitted).toBe(false);
    expect(gate.reasons[0]).toContain('no verified medicine information');
  });

  it('names no product when the sources do not agree', () => {
    const weak = ladder({
      evidence: {
        agreement: AGREEMENT_FLOOR - 0.01,
        citations: ladder().evidence.citations,
      },
    });
    const gate = gateLadder(baseCase(COCCI_CASIS), weak);
    expect(gate.permitted).toBe(false);
    expect(gate.reasons).toContain('the sources do not agree on the treatment');
  });

  it('permits a ladder sitting exactly on the agreement floor', () => {
    const exact = ladder({
      evidence: { agreement: AGREEMENT_FLOOR, citations: ladder().evidence.citations },
    });
    expect(gateLadder(baseCase(COCCI_CASIS), exact).permitted).toBe(true);
  });

  it('rejects an agreement score that could not be checked', () => {
    const broken = ladder({
      evidence: { agreement: Number.NaN, citations: ladder().evidence.citations },
    });
    const gate = gateLadder(baseCase(COCCI_CASIS), broken);
    expect(gate.permitted).toBe(false);
    expect(gate.reasons.join(' ')).toContain('could not be checked');
  });

  it('rejects a score above one, which cannot be an agreement rate', () => {
    const broken = ladder({
      evidence: { agreement: 1.4, citations: ladder().evidence.citations },
    });
    expect(gateLadder(baseCase(COCCI_CASIS), broken).permitted).toBe(false);
  });

  it('needs two independent sources, not two citations from one', () => {
    const oneSource = ladder({
      evidence: {
        agreement: 0.9,
        citations: [
          { source: 'MSD Veterinary Manual', locator: 'Coccidiosis, poultry' },
          { source: 'MSD Veterinary Manual', locator: 'Anticoccidials overview' },
        ],
      },
    });
    const gate = gateLadder(baseCase(COCCI_CASIS), oneSource);
    expect(gate.permitted).toBe(false);
    expect(gate.reasons[0]).toContain(`${MIN_CITATIONS} independent sources`);
  });

  it('never names a product for a notifiable disease', () => {
    const gate = gateLadder(
      baseCase({ diseaseHits: ['avian_influenza'] }),
      ladder({ disease: 'avian_influenza' }),
    );
    expect(gate.permitted).toBe(false);
  });
});

describe('POLICY_REFUSALS', () => {
  it('carries the counterfeit guard on every case', () => {
    for (const guard of COUNTERFEIT_GUARD) {
      expect(POLICY_REFUSALS).toContain(guard);
    }
  });

  it('always refuses a general antibiotic and a virus cure', () => {
    expect(POLICY_REFUSALS.join(' ')).toContain('resistance is documented');
    expect(POLICY_REFUSALS.join(' ')).toContain('no antibiotic cures a virus');
  });

  it('always refuses an undosed feed mix and a broken cold chain', () => {
    expect(POLICY_REFUSALS.join(' ')).toContain('no stated dose');
    expect(POLICY_REFUSALS.join(' ')).toContain('cold chain');
  });
});
