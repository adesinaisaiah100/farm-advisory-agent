import { describe, expect, it } from 'vitest';
import type { CaseData } from '@poultry/schemas';
import { MAX_TRIAGE_TURNS } from './triage.js';
import {
  hasReportableSignal,
  MASS_MORTALITY_PCT,
  mortalityRate,
  validateCase,
} from './validate.js';

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

describe('mortalityRate', () => {
  it('prefers the explicit rate when present', () => {
    expect(mortalityRate(baseCase({ mortalityRatePct: 12.5 }))).toBe(12.5);
  });

  it('derives rate from count and size', () => {
    expect(mortalityRate(baseCase({ mortalityCount: 50 }))).toBe(10);
  });

  it('is undefined without count or size', () => {
    expect(
      mortalityRate(baseCase({ mortalityCount: undefined, farmSize: undefined })),
    ).toBeUndefined();
  });

  it('protects against divide by zero', () => {
    expect(mortalityRate(baseCase({ farmSize: 0 }))).toBeUndefined();
  });
});

describe('hasReportableSignal', () => {
  it('true when symptoms and a known species exist', () => {
    expect(hasReportableSignal(baseCase())).toBe(true);
  });

  it('false when species is unknown', () => {
    expect(hasReportableSignal(baseCase({ species: 'unknown' }))).toBe(false);
  });

  it('false when there are no symptoms yet', () => {
    expect(hasReportableSignal(baseCase({ symptoms: undefined }))).toBe(false);
  });
});

describe('validateCase', () => {
  it('escalates on a red flag', () => {
    const d = validateCase(baseCase({ symptoms: ['sudden death'] }), false);
    expect(d.door).toBe('escalate');
    expect(d.caseStatus).toBe('escalated');
    expect(d.reasons).toContain('red flag: sudden_death');
  });

  it('escalates on a red flag the farmer described in Pidgin', () => {
    const d = validateCase(baseCase({ symptoms: ['neck dey bend'] }), false);
    expect(d.door).toBe('escalate');
    expect(d.reasons).toContain('red flag: neck_sign');
  });

  it('escalates on suspected avian influenza', () => {
    const d = validateCase(baseCase({ diseaseHits: ['avian_influenza'] }), false);
    expect(d.door).toBe('escalate');
    expect(d.reasons).toContain('suspected avian influenza (notifiable)');
  });

  it('escalates on mass mortality at the threshold', () => {
    const d = validateCase(
      baseCase({ mortalityCount: (MASS_MORTALITY_PCT * 500) / 100 + 1 }),
      false,
    );
    expect(d.door).toBe('escalate');
    expect(d.reasons).toContain('mass mortality');
  });

  it('does not escalate a safe complete case', () => {
    const d = validateCase(baseCase(), false);
    expect(d.door).toBe('resolve');
    expect(d.caseStatus).toBe('complete');
  });

  it('opens the supply door when the farmer wants to buy', () => {
    const d = validateCase(baseCase(), true);
    expect(d.door).toBe('supply');
    expect(d.caseStatus).toBe('complete');
  });

  it('collects further detail when the case is incomplete', () => {
    const d = validateCase(baseCase({ onsetDays: undefined }), false);
    expect(d.door).toBe('collect');
    expect(d.caseStatus).toBe('in_progress');
    expect(d.missingFields).toContain('onsetDays');
  });

  it('safety is checked before completeness', () => {
    const d = validateCase(baseCase({ symptoms: ['bird dey gasp'], onsetDays: undefined }), false);
    expect(d.door).toBe('escalate');
  });

  it('tries to tell two look-alikes apart instead of resolving a coin flip', () => {
    const d = validateCase(
      baseCase({ diseaseHits: ['newcastle', 'infectious_bronchitis'] }),
      false,
    );
    expect(d.door).toBe('triage');
    expect(d.caseStatus).toBe('in_progress');
    expect(d.reasons).toContain('cannot separate newcastle from infectious_bronchitis');
  });

  it('does not sell medicine to a farmer while the diagnosis is open', () => {
    const d = validateCase(baseCase({ diseaseHits: ['coccidiosis', 'necrotic_enteritis'] }), true);
    expect(d.door).toBe('triage');
  });

  it('escalates a case that stayed ambiguous through every discriminating question', () => {
    const d = validateCase(
      baseCase({
        diseaseHits: ['newcastle', 'infectious_bronchitis'],
        triageTurns: MAX_TRIAGE_TURNS,
      }),
      false,
    );
    expect(d.door).toBe('escalate');
    expect(d.reasons).toContain(
      `still ambiguous after ${MAX_TRIAGE_TURNS} discriminating questions`,
    );
  });

  it('keeps textbook coccidiosis out of the escalation queue', () => {
    const d = validateCase(
      baseCase({ symptoms: ['blood in droppings'], diseaseHits: ['coccidiosis'] }),
      true,
    );
    expect(d.door).toBe('supply');
  });
});
