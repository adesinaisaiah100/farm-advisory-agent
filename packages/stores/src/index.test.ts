import { describe, expect, it } from 'vitest';
import { StoreSchema } from '@poultry/schemas';
import type { AgroStore } from '@poultry/schemas';
import {
  STORES,
  coveredLgas,
  getStores,
  hasStock,
  pickReferral,
  searchByLga,
  verifiedStock,
} from './index.js';

const PARTNER_STORE: AgroStore = {
  id: '4b1f0d92-6c3a-4a51-9f77-2d8e5b6c0a13',
  name: 'Partner Verified Store',
  phone: '+2348099999999',
  state: 'Ogun',
  lga: 'Abeokuta North',
  stock: ['vitamins', 'dewormer'],
  stockVerifiedAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-20T00:00:00.000Z',
};

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

  it('claims no stock at all, because no store has confirmed its inventory with us', () => {
    for (const store of STORES) {
      expect(store.stock, store.name).toBeUndefined();
      expect(store.stockVerifiedAt, store.name).toBeUndefined();
      expect(verifiedStock(store), store.name).toEqual([]);
    }
  });
});

describe('hasStock', () => {
  it('matches a partner-confirmed item case-insensitively', () => {
    expect(hasStock(PARTNER_STORE, 'Vitamins')).toBe(hasStock(PARTNER_STORE, 'vitamins'));
  });

  it('misses an item the partner did not confirm', () => {
    expect(hasStock(PARTNER_STORE, 'ivermectin pour-on')).toBe(false);
  });

  it('does not match an empty item', () => {
    expect(hasStock(PARTNER_STORE, '   ')).toBe(false);
  });

  it('ignores a stock list nobody confirmed', () => {
    const unverified: AgroStore = { ...PARTNER_STORE, stock: ['vitamins'], stockVerifiedAt: undefined };
    expect(hasStock(unverified, 'vitamins')).toBe(false);
    expect(verifiedStock(unverified)).toEqual([]);
  });

  it('reports no stock for every seeded store', () => {
    for (const store of STORES) {
      expect(hasStock(store, 'vitamins'), store.name).toBe(false);
    }
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
  it('returns the store covering the LGA', () => {
    expect(pickReferral({ lga: 'Kaduna North' })?.name).toBe('Sunrise Agro Store');
  });

  it('narrows by state before choosing', () => {
    expect(pickReferral({ lga: 'Jos North', state: 'Plateau' })?.name).toBe('Hope Agro Vet');
    expect(pickReferral({ lga: 'Jos North', state: 'Oyo' })).toBeUndefined();
  });

  it('breaks ties deterministically by name', () => {
    expect(pickReferral({ lga: 'Ibadan North' })?.name).toBe('Adaeze Agro Vet');
    expect(pickReferral({ state: 'Lagos' })?.name).toBe('GreenField Vet Supplies');
  });

  it('chooses on location alone, never on an inventory claim', () => {
    const store = pickReferral({ lga: 'Enugu North' });
    expect(store?.name).toBe('FarmCare Supplies');
    expect(verifiedStock(store!)).toEqual([]);
  });

  it('returns undefined when the LGA is not covered', () => {
    expect(pickReferral({ lga: 'Nowhere Land' })).toBeUndefined();
  });

  it('can search across LGAs when no location is given', () => {
    expect(pickReferral()).toBeDefined();
  });
});

describe('coveredLgas', () => {
  it('returns unique state/LGA pairs in stable order', () => {
    const coverage = coveredLgas();
    const keys = coverage.map((c) => `${c.lga}|${c.state}`);
    expect(new Set(keys).size).toBe(coverage.length);
    const sorted = [...coverage].sort(
      (a, b) => a.state.localeCompare(b.state) || a.lga.localeCompare(b.lga),
    );
    expect(coverage).toEqual(sorted);
  });
});
