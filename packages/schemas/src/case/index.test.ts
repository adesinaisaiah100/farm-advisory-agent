import { describe, expect, it } from 'vitest';
import { CaseSchema, hasRedFlag, redFlagsFor } from './index.js';
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

describe('hasRedFlag', () => {
  it.each([
    [['sudden death', 'wet droppings'], true],
    [['swollen head'], true],
    [['SUDDEN DEATH'], true],
    [['normal feather loss'], false],
    [[], false],
  ])('flags %j as red=%s', (symptoms, expected) => {
    const c: CaseData = { symptoms, status: 'in_progress' };
    expect(hasRedFlag(c)).toBe(expected);
  });

  it('returns false when no symptoms are recorded', () => {
    const c: CaseData = { symptoms: undefined, status: 'in_progress' };
    expect(hasRedFlag(c)).toBe(false);
  });

  it('catches a red flag the farmer described in Pidgin', () => {
    const c: CaseData = { symptoms: ['neck dey bend'], status: 'in_progress' };
    expect(redFlagsFor(c)).toContain('neck_sign');
  });

  it.each([
    ['birds dey die suddenly', 'sudden_death'],
    ['one bird die quick this morning', 'sudden_death'],
    ['neck twist as I dey see am', 'neck_sign'],
    ['comb turn dark blue', 'comb_discolouration'],
    ['wattl dey purple', 'comb_discolouration'],
    ['bird no fit walk again', 'inability_to_stand'],
    ['one wing hang down', 'wing_droop'],
    ['dey tremble', 'trembling'],
    ['bird dey gasp', 'gasping'],
    ['head swell small', 'head_swelling'],
  ])('reads %j as the %s red flag', (symptom, ruleId) => {
    const c: CaseData = { symptoms: [symptom], status: 'in_progress' };
    expect(redFlagsFor(c)).toContain(ruleId);
  });

  it('does not read ordinary complaints as red flags', () => {
    const c: CaseData = {
      symptoms: ['blood in droppings', 'ruffled feathers', 'low feed intake', 'diarrhoea'],
      status: 'in_progress',
    };
    expect(redFlagsFor(c)).toEqual([]);
  });

  it('reports every red flag the case triggers, without duplicates', () => {
    const c: CaseData = {
      symptoms: ['neck dey bend', 'bird dey gasp', 'diary dey pour'],
      status: 'in_progress',
    };
    expect(redFlagsFor(c)).toEqual(['neck_sign', 'gasping']);
  });
});

describe('DiseaseSchema', () => {
  it('represents the look-alikes the triage ladder has to separate', () => {
    const parsed = CaseSchema.safeParse({
      status: 'in_progress',
      diseaseHits: ['newcastle', 'infectious_bronchitis', 'coccidiosis', 'necrotic_enteritis'],
    });
    expect(parsed.success).toBe(true);
  });
});
