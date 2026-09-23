import { describe, expect, it } from 'vitest';
import { hasItem, type AgroStore } from './index.js';

const store: AgroStore = {
  id: 's1',
  name: 'FarmVet Supplies',
  lga: 'Ojo',
  state: 'Lagos',
  phone: '08010000000',
  hasStock: ['newcastle vaccine', 'gumboro vaccine'],
};

describe('hasItem', () => {
  it('finds an item in stock', () => {
    expect(hasItem(store, 'Newcastle Vaccine')).toBe(true);
  });

  it('misses an out-of-stock item', () => {
    expect(hasItem(store, 'fowl pox vaccine')).toBe(false);
  });
});