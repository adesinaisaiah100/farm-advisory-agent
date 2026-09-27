import { describe, expect, it } from 'vitest';
import { TREATMENT_SECTIONS, buildSearchPlan, corpusSpeciesFor, queryTextFor } from './plan.js';
import { makeCase } from './fixtures.js';

describe('corpusSpeciesFor', () => {
  it('maps a known species onto the corpus vocabulary', () => {
    expect(corpusSpeciesFor('broiler')).toEqual(['broiler']);
    expect(corpusSpeciesFor('layer')).toEqual(['layer']);
    expect(corpusSpeciesFor('cockerel')).toEqual(['cockerel']);
  });

  it('applies no species filter for a mixed flock', () => {
    expect(corpusSpeciesFor('mixed')).toEqual([]);
  });

  it('applies no species filter when the species was never told', () => {
    expect(corpusSpeciesFor('unknown')).toEqual([]);
    expect(corpusSpeciesFor(undefined)).toEqual([]);
  });
});

describe('queryTextFor', () => {
  it('joins the symptoms the farmer reported', () => {
    expect(queryTextFor(makeCase({ symptoms: ['birds dey eat less'], diseaseHits: undefined }))).toBe(
      'broiler birds dey eat less',
    );
  });

  it('spells out a disease hit so the embedding sees words', () => {
    expect(queryTextFor(makeCase({ symptoms: undefined }))).toBe('broiler coccidiosis');
  });

  it("leaves an 'unknown' disease hit out of the filter", () => {
    expect(queryTextFor(makeCase({ symptoms: undefined, diseaseHits: ['unknown'] }))).toBe('broiler');
  });

  it('refuses to build a query out of an empty case', () => {
    expect(() => queryTextFor({ status: 'in_progress' })).toThrow(/nothing to retrieve against/);
  });
});

describe('buildSearchPlan', () => {
  it('restricts to the sections that can carry a treatment', () => {
    expect(buildSearchPlan(makeCase()).sections).toEqual(TREATMENT_SECTIONS);
  });

  it('oversamples the candidate pool so the diversity cap has something to choose from', () => {
    const plan = buildSearchPlan(makeCase(), {
      topK: 8,
      maxPerGroup: 2,
      candidateOversample: 3,
      starvationFloor: 2,
    });

    expect(plan.topK).toBe(8);
    expect(plan.limit).toBe(24);
  });

  it('carries the corpus species and usable diseases as filters', () => {
    const plan = buildSearchPlan(makeCase({ species: 'layer', diseaseHits: ['coccidiosis', 'unknown'] }));

    expect(plan.species).toEqual(['layer']);
    expect(plan.diseases).toEqual(['coccidiosis']);
  });

  it('rejects a policy that asks for nothing', () => {
    expect(() =>
      buildSearchPlan(makeCase(), {
        topK: 0,
        maxPerGroup: 2,
        candidateOversample: 3,
        starvationFloor: 2,
      }),
    ).toThrow(/topK must be positive/);
  });
});
