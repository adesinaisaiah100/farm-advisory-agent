import { describe, expect, it } from 'vitest';
import type { CaseData } from '@poultry/schemas';
import { isComplete, missing } from './missing.js';
import { mergeDelta } from './merge.js';
import type { CaseDelta } from './llm.js';

describe('missing', () => {
  it('reports every required field for an empty case', () => {
    expect(missing({ status: 'in_progress' })).toEqual(['species', 'symptoms', 'onsetDays', 'mortalityCount']);
  });

  it('treats unknown species as missing', () => {
    expect(missing({ status: 'in_progress', species: 'unknown' })).toContain('species');
  });

  it('treats empty symptoms as missing', () => {
    expect(missing({ status: 'in_progress', symptoms: [] })).toContain('symptoms');
  });

  it('counts each filled field as present', () => {
    expect(
      missing({
        status: 'in_progress',
        species: 'layer',
        symptoms: ['coughing'],
        onsetDays: 2,
        mortalityCount: 3,
      }),
    ).toEqual([]);
  });

  it('order is deterministic', () => {
    const a = missing({ status: 'in_progress' });
    const b = missing({ status: 'in_progress' });
    expect(a).toEqual(b);
  });
});

describe('isComplete', () => {
  it('false when fields are missing', () => {
    expect(isComplete({ status: 'in_progress', species: 'layer' })).toBe(false);
  });

  it('true when all required fields present', () => {
    const c: CaseData = {
      status: 'in_progress',
      species: 'broiler',
      symptoms: ['diarrhoea'],
      onsetDays: 1,
      mortalityCount: 1,
    };
    expect(isComplete(c)).toBe(true);
  });
});

describe('missing monotonicity across merges', () => {
  it('once a field is filled it never returns to missing', () => {
    let c: CaseData = { status: 'in_progress' };
    const deltas: Array<{ fill: string; delta: CaseDelta }> = [
      { fill: 'species', delta: { species: 'broiler' } },
      { fill: 'symptoms', delta: { symptoms: ['x'] } },
      { fill: 'onsetDays', delta: { onsetDays: 2 } },
      { fill: 'mortalityCount', delta: { mortalityCount: 3 } },
    ];
    const seen: string[][] = [];
    for (const d of deltas) {
      c = mergeDelta(c, d.delta);
      seen.push(missing(c));
      const emptyAttempt = mergeDelta(c, { symptoms: [] });
      expect(missing(emptyAttempt)).toEqual(seen[seen.length - 1]);
    }
    expect(missing(c)).toEqual([]);
  });
});