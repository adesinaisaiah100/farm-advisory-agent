import { describe, expect, it } from 'vitest';
import { StoreSchema } from '@poultry/schemas';
import { STORES, coveredLgas, getStores, hasStock, pickReferral, searchByLga } from './index.js';

describe('store seed', () => {
  it('every entry matches the shared StoreSchema', () => {
    for (const store of STORES) {
      const parsed = StoreSchema.safeParse(store);
      expect(parsed.success, `${store.name} must match StoreSchema`).toBe(true);
    }
  });

  it('uses unique ids and E.164 phone numbers', () => {
    const ids = new Set(STORES.map((s) => s.id));
    expect(ids.size).toBe(STORES.length);
    for (const store of STORES) {
      expect(store.phone).toMatch(/^\+234\d{10}$/);
    }
  });

  it('is non-empty and exposed as a defensive copy', () => {
    expect(STORES.length).toBeGreaterThan(0);
    const first = getStores();
    first.pop();
    expect(getStores().length).toBe(STORES.length);
  });
});

describe('hasStock', () => {
  const store = STORES[0]!;

  it('matches case-insensitively', () => {
    expect(hasStock(store, 'Vitamins')).toBe(hasStock(store, 'vitamins'));
  });

  it('misses an item the store does not carry', () => {
    expect(hasStock(store, 'ivermectin pour-on')).toBe(false);
  });

  it('does not match an empty item', () => {
    expect(hasStock(store, '   ')).toBe(false);
  });
});

describe('searchByLga', () => {
  it('finds stores for a known LGA regardless of case', () => {
    const upper = searchByLga('IBADAN NORTH');
    const lower = searchByLga('ibadan north');
    expect(upper.length).toBeGreaterThan(0);
    expect(upper.map((s) => s.id)).toEqual(lower.map((s) => s.id));
  });

  it('narrows by state when given', () => {
    expect(searchByLga('Jos North', 'Plateau').length).toBe(1);
    expect(searchByLga('Jos North', 'Oyo')).toEqual([]);
  });

  it('returns nothing for an unlisted LGA or blank input', () => {
    expect(searchByLga('Nowhere Land')).toEqual([]);
    expect(searchByLga('  ')).toEqual([]);
  });
});

describe('pickReferral', () => {
  it('prefers an open store carrying the item', () => {
    const store = pickReferral({ lga: 'Kaduna North', item: 'gumboro vaccine' });
    expect(store?.name).toBe('Sunrise Agro Store');
  });

  it('falls back to the only store even when it is closed', () => {
    const store = pickReferral({ lga: 'Kaduna North', item: 'vitamin a' });
    expect(store?.name).toBe('Sunrise Agro Store');
    expect(store?.isOpen).toBe(false);
  });

  it('prefers an open store when a closed one carries the item', () => {
    const store = pickReferral({ lga: 'Ojo', item: 'dewormer' });
    expect(store?.name).toBe('GreenField Vet Supplies');
    expect(store?.isOpen).toBe(true);
  });

  it('falls back to the LGA store when the item is not stocked anywhere', () => {
    const store = pickReferral({ lga: 'Enugu North', item: 'ivermectin pour-on' });
    expect(store?.name).toBe('FarmCare Supplies');
  });

  it('breaks ties deterministically by name', () => {
    const store = pickReferral({ lga: 'Ibadan North' });
    expect(store?.name).toBe('Adaeze Agro Vet');
  });

  it('returns undefined when the LGA is not covered', () => {
    expect(pickReferral({ lga: 'Nowhere Land' })).toBeUndefined();
  });

  it('can search across LGAs when no location is given', () => {
    const store = pickReferral({ item: 'dewormer' });
    expect(store?.stock).toContain('dewormer');
  });
});

describe('coveredLgas', () => {
  it('returns unique state/LGA pairs in stable order', () => {
    const coverage = coveredLgas();
    const keys = coverage.map((c) => `${c.lga}|${c.state}`);
    expect(new Set(keys).size).toBe(coverage.length);
    const sorted = [...coverage].sort((a, b) =>
      a.state.localeCompare(b.state) || a.lga.localeCompare(b.lga)
    );
    expect(coverage).toEqual(sorted);
  });
});
