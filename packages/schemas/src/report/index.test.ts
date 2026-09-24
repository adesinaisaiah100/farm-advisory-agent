import { describe, expect, it } from 'vitest';
import { anonymise, ReportSchema } from './index.js';

const ID = '9d47f8cd-4b6f-4f1a-8a6b-9ae1aef9b701';
const WHEN = '2026-09-24T10:00:00.000Z';

describe('ReportSchema', () => {
  it('accepts an anonymisable report', () => {
    const r = {
      id: ID,
      sessionId: ID,
      caseId: ID,
      farmerPhone: '+2348012345678',
      state: 'Ogun',
      lga: 'Abeokuta North',
      species: 'broiler',
      farmSize: 500,
      symptoms: ['neck dey twist'],
      diseaseHits: ['newcastle'],
      mortalityCount: 10,
      createdAt: WHEN,
    };
    expect(ReportSchema.safeParse(r).success).toBe(true);
  });

  it('requires a phone and timestamp', () => {
    expect(
      ReportSchema.safeParse({ id: ID, createdAt: WHEN, farmerPhone: '+2348012345678' }).success,
    ).toBe(true);
    expect(ReportSchema.safeParse({ id: ID }).success).toBe(false);
  });
});

describe('anonymise', () => {
  it('strips the farmer phone from a report', () => {
    const r = ReportSchema.parse({
      id: ID,
      farmerPhone: '+2348012345678',
      state: 'Ogun',
      species: 'broiler',
      symptoms: ['bleeding'],
      diseaseHits: ['coccidiosis'],
      createdAt: WHEN,
    });
    const out = anonymise(r);
    expect(out).not.toHaveProperty('farmerPhone');
    expect(out.state).toBe('Ogun');
    expect(out.diseaseHits).toEqual(['coccidiosis']);
  });
});