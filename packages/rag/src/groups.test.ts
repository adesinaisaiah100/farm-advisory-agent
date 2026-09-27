import { describe, expect, it } from 'vitest';
import type { AnalyzedRegion } from './analyze.js';
import { buildGroups } from './groups.js';

function region(over: Partial<AnalyzedRegion> & { text: string }): AnalyzedRegion {
  return {
    heading: 'Treatment',
    sectionKind: 'disease_treatment',
    species: ['poultry'],
    diseases: ['newcastle'],
    page: 1,
    ...over,
  };
}

describe('buildGroups', () => {
  it('merges consecutive regions sharing a page and heading', () => {
    const { groups } = buildGroups('doc', [
      region({ text: 'First part of the treatment section.' }),
      region({ text: 'Second part of the same section.' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.text).toBe('First part of the treatment section.\n\nSecond part of the same section.');
  });

  it('starts a new group when the heading changes', () => {
    const { groups } = buildGroups('doc', [
      region({ text: 'Treatment prose.' }),
      region({ text: 'Prevention prose.', heading: 'Prevention', sectionKind: 'disease_prevention' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[1]?.heading).toBe('Prevention');
  });

  it('starts a new group at a page boundary', () => {
    const { groups } = buildGroups('doc', [
      region({ text: 'Ends on page one.' }),
      region({ text: 'Continues on page two.', page: 2 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[1]?.page).toBe(2);
  });

  it('orders regions by page so grouping is deterministic', () => {
    const { groups } = buildGroups('doc', [
      region({ text: 'Page two text.', page: 2 }),
      region({ text: 'Page one text.', page: 1 }),
    ]);
    expect(groups.map((group) => group.page)).toEqual([1, 2]);
  });

  it('unions species and diseases across a merged group', () => {
    const { groups } = buildGroups('doc', [
      region({ text: 'Broiler guidance.', species: ['broiler', 'poultry'], diseases: ['newcastle'] }),
      region({ text: 'Layer guidance.', species: ['layer'], diseases: ['gumboro'] }),
    ]);
    expect(groups[0]?.species).toEqual(['broiler', 'poultry', 'layer']);
    expect(groups[0]?.diseases).toEqual(['newcastle', 'gumboro']);
  });

  it('keeps the first treatment and warns when merged regions disagree', () => {
    const treatment = {
      productClass: 'Antibiotic - do not use for viral disease',
      why: 'Newcastle disease is viral.',
      askTheSeller: ['Is this for a virus or a bacteria?'],
      needsVet: true,
    };
    const { groups, warnings } = buildGroups('doc', [
      region({ text: 'First.', treatment }),
      region({ text: 'Second.', treatment: { ...treatment, productClass: 'Antiviral' } }),
    ]);
    expect(groups[0]?.treatment?.productClass).toBe(treatment.productClass);
    expect(warnings.join(' ')).toContain('disagree on product class');
  });

  it('carries no treatment when none is present', () => {
    const { groups } = buildGroups('doc', [region({ text: 'Signs only.', sectionKind: 'disease_signs' })]);
    expect(groups[0]?.treatment).toBeUndefined();
  });

  it('assigns stable sequential ids', () => {
    const { groups } = buildGroups('doc', [
      region({ text: 'One.' }),
      region({ text: 'Two.', heading: 'Signs', sectionKind: 'disease_signs' }),
    ]);
    expect(groups.map((group) => group.id)).toEqual(['doc#g0', 'doc#g1']);
  });

  it('returns nothing for no regions', () => {
    expect(buildGroups('doc', []).groups).toEqual([]);
  });
});
