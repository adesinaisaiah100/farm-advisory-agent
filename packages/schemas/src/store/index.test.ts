import { describe, expect, it } from 'vitest';
import { StoreSchema } from './index.js';

const ID = '9d47f8cd-4b6f-4f1a-8a6b-9ae1aef9b701';

const base = {
  id: ID,
  name: 'Abeokuta Vet Store',
  phone: '+2348077777777',
  state: 'Ogun',
  lga: 'Abeokuta North',
  updatedAt: '2026-09-24T10:00:00.000Z',
};

describe('StoreSchema', () => {
  it('accepts a store with a partner-confirmed stock list', () => {
    const s = {
      ...base,
      stock: ['lasota vaccine', 'broad spectrum antibiotic'],
      stockVerifiedAt: '2026-09-24T10:00:00.000Z',
    };
    expect(StoreSchema.safeParse(s).success).toBe(true);
  });

  it('accepts a store with no stock claim at all', () => {
    expect(StoreSchema.safeParse({ ...base, stock: undefined }).success).toBe(true);
    expect(StoreSchema.safeParse({ ...base, stock: [] }).success).toBe(true);
  });

  it('rejects a stock list nobody has confirmed', () => {
    const s = { ...base, stock: ['lasota vaccine'] };
    expect(StoreSchema.safeParse(s).success).toBe(false);
  });

  it('rejects an empty stock item', () => {
    const s = { ...base, stock: [''], stockVerifiedAt: '2026-09-24T10:00:00.000Z' };
    expect(StoreSchema.safeParse(s).success).toBe(false);
  });

  it('rejects an unparseable verification timestamp', () => {
    const s = { ...base, stock: ['lasota vaccine'], stockVerifiedAt: 'last tuesday' };
    expect(StoreSchema.safeParse(s).success).toBe(false);
  });
});
