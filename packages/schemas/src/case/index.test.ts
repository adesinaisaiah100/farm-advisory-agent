import { describe, expect, it } from 'vitest';
import { CaseSchema, hasCriticalSymptom } from './index.js';
import type { CaseData } from './index.js';

describe('CaseSchema', () => {
  it('accepts an in-progress case with symptoms', () => {
    const c = {
      species: 'broiler',
      farmSize: 500,
      flockAgeWeeks: 6,
      symptoms: ['neck dey twist', 'birds dey die'],
      onsetDays: 2,
      mortalityCount: 10,
      mortalityRatePct: 2,
      status: 'in_progress',
    };
    expect(CaseSchema.safeParse(c).success).toBe(true);
  });

  it('accepts canonical disease text, breed, stage and confirm flags', () => {
    const c = {
      species: 'layer',
      breed: 'Noiler (cross)',
      birdStage: 'point_of_lay',
      symptoms: ['birds no dey eat'],
      diseaseText: 'Newcastle disease',
      diseaseHits: ['newcastle'],
      needsConfirmation: ['diseaseHits'],
      status: 'in_progress',
    };
    expect(CaseSchema.safeParse(c).success).toBe(true);
  });

  it('rejects an unknown bird stage', () => {
    const c = { status: 'in_progress', birdStage: 'in-molt' };
    expect(CaseSchema.safeParse(c).success).toBe(false);
  });

  it('accepts a complete case with disease hits and a door', () => {
    const c = {
      diseaseHits: ['newcastle'],
      door: 'escalate',
      status: 'complete',
    };
    expect(CaseSchema.safeParse(c).success).toBe(true);
  });

  it('rejects an out-of-range mortality rate', () => {
    const c = { status: 'in_progress', mortalityRatePct: 150 };
    expect(CaseSchema.safeParse(c).success).toBe(false);
  });
});

describe('hasCriticalSymptom', () => {
  it.each([
    [['sudden death', 'wet droppings'], true],
    [['blood in droppings'], true],
    [['swollen head'], true],
    [['neck dey twist'], false],
    [['normal feather loss'], false],
  ])('flags %j as critical=%s', (symptoms, expected) => {
    const c: CaseData = { symptoms, status: 'in_progress' };
    expect(hasCriticalSymptom(c)).toBe(expected);
  });

  it('treats CRITICAL_SYMPTOMS case-insensitively', () => {
    const c: CaseData = { symptoms: ['SUDDEN DEATH'], status: 'in_progress' };
    expect(hasCriticalSymptom(c)).toBe(true);
  });

  it('returns false when no symptoms are recorded', () => {
    const c: CaseData = { symptoms: undefined, status: 'in_progress' };
    expect(hasCriticalSymptom(c)).toBe(false);
  });
});