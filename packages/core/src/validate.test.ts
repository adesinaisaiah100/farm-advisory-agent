import { describe, expect, it } from 'vitest';
import type { CaseData } from '@poultry/schemas';
import { hasReportableSignal, MASS_MORTALITY_PCT, mortalityRate, validateCase } from './validate.js';

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
    expect(mortalityRate(baseCase({ mortalityCount: undefined, farmSize: undefined }))).toBeUndefined();
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
  it('escalates on a critical symptom', () => {
    const d = validateCase(baseCase({ symptoms: ['sudden death'] }), false);
    expect(d.door).toBe('escalate');
    expect(d.caseStatus).toBe('escalated');
    expect(d.reasons).toContain('critical symptom');
  });

  it('escalates on suspected avian influenza', () => {
    const d = validateCase(baseCase({ diseaseHits: ['avian_influenza'] }), false);
    expect(d.door).toBe('escalate');
    expect(d.reasons).toContain('suspected avian influenza (notifiable)');
  });

  it('escalates on mass mortality at the threshold', () => {
    const d = validateCase(baseCase({ mortalityCount: (MASS_MORTALITY_PCT * 500) / 100 + 1 }), false);
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
    const d = validateCase(baseCase({ symptoms: ['paralysis'], onsetDays: undefined }), false);
    expect(d.door).toBe('escalate');
  });
});