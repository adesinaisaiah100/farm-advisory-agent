import { describe, expect, it } from 'vitest';
import type { CaseData } from '@poultry/schemas';
import { mergeDelta } from './merge.js';
import type { CaseDelta } from './llm.js';

function baseCase(overrides: Partial<CaseData> = {}): CaseData {
  return { species: 'broiler', symptoms: ['diarrhoea'], status: 'in_progress', ...overrides };
}

describe('mergeDelta', () => {
  it('fills empty case fields from the delta', () => {
    const next = mergeDelta({ status: 'in_progress' }, { species: 'layer', onsetDays: 3 });
    expect(next).toMatchObject({ species: 'layer', onsetDays: 3, status: 'in_progress' });
  });

  it('overwrites an existing scalar', () => {
    const next = mergeDelta(baseCase({ breed: 'old' }), { breed: 'new' });
    expect(next.breed).toBe('new');
  });

  it('ignores empty arrays so existing values are never cleared', () => {
    const next = mergeDelta(baseCase({ symptoms: ['diarrhoea'] }), { symptoms: [] });
    expect(next.symptoms).toEqual(['diarrhoea']);
  });

  it('accumulates symptoms rather than replacing them', () => {
    const next = mergeDelta(baseCase(), { symptoms: ['coughing'] });
    expect(next.symptoms).toEqual(['diarrhoea', 'coughing']);
  });

  it('does not touch fields absent from the delta', () => {
    const next = mergeDelta(baseCase({ onsetDays: 2 }), { breed: 'marshal' });
    expect(next.onsetDays).toBe(2);
  });

  it('keeps ids and status from the existing case', () => {
    const next = mergeDelta(baseCase({ id: '9d47f8cd-4b6f-4f1a-8a6b-9ae1aef9b701', status: 'in_progress' }), {
      species: 'layer',
    });
    expect(next.id).toBe('9d47f8cd-4b6f-4f1a-8a6b-9ae1aef9b701');
    expect(next.status).toBe('in_progress');
  });

  it('handles an empty delta as a no-op', () => {
    const c = baseCase();
    const next = mergeDelta(c, {} satisfies CaseDelta);
    expect(next).toEqual(c);
  });
});