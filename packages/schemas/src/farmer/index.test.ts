import { describe, expect, it } from 'vitest';
import { BirdStageSchema, FarmerSchema, isMiddleTier, SpeciesSchema } from './index.js';

describe('FarmerSchema', () => {
  it('accepts a minimum farmer with only a phone', () => {
    expect(FarmerSchema.safeParse({ phone: '+2348012345678' }).success).toBe(true);
  });

  it('accepts a full farmer', () => {
    const farmer = {
      phone: '+2348112233445',
      name: 'Adaeze',
      location: { lga: 'Surulere', state: 'Lagos' },
      farmSize: 500,
      species: 'broiler',
    };
    expect(FarmerSchema.safeParse(farmer).success).toBe(true);
  });

  it('rejects farm sizes below the middle tier', () => {
    expect(FarmerSchema.safeParse({ phone: '+2348012345678', farmSize: 50 }).success).toBe(false);
  });

  it('rejects farm sizes above the middle tier', () => {
    expect(FarmerSchema.safeParse({ phone: '+2348012345678', farmSize: 5000 }).success).toBe(false);
  });

  it('accepts a cross-breed name as free text', () => {
    expect(
      FarmerSchema.safeParse({ phone: '+2348012345678', breed: 'Noiler (cross)' }).success,
    ).toBe(true);
  });

  it('rejects an over-long breed name', () => {
    expect(
      FarmerSchema.safeParse({ phone: '+2348012345678', breed: 'x'.repeat(81) }).success,
    ).toBe(false);
  });
});

describe('BirdStageSchema', () => {
  it('accepts known stages', () => {
    for (const s of [
      'chick',
      'grower',
      'pullet',
      'point_of_lay',
      'layer',
      'finisher',
      'spent',
      'unknown',
    ]) {
      expect(BirdStageSchema.safeParse(s).success).toBe(true);
    }
  });

  it('rejects a made-up stage', () => {
    expect(BirdStageSchema.safeParse('in-molt').success).toBe(false);
  });
});

describe('isMiddleTier', () => {
  it('flags middle-tier flock sizes', () => {
    expect(isMiddleTier(200)).toBe(true);
    expect(isMiddleTier(2000)).toBe(true);
    expect(isMiddleTier(800)).toBe(true);
  });

  it('does not flag outside-range sizes', () => {
    expect(isMiddleTier(199)).toBe(false);
    expect(isMiddleTier(2001)).toBe(false);
    expect(isMiddleTier(undefined)).toBe(false);
  });
});

describe('SpeciesSchema', () => {
  it('accepts known species', () => {
    for (const s of ['broiler', 'layer', 'cockerel', 'mixed', 'unknown']) {
      expect(SpeciesSchema.safeParse(s).success).toBe(true);
    }
  });

  it('rejects unknown species', () => {
    expect(SpeciesSchema.safeParse('turkey').success).toBe(false);
  });
});