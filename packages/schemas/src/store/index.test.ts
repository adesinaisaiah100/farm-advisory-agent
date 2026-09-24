import { describe, expect, it } from 'vitest';
import { StoreSchema } from './index.js';

const ID = '9d47f8cd-4b6f-4f1a-8a6b-9ae1aef9b701';

describe('StoreSchema', () => {
  it('accepts a store with vetsin stock', () => {
    const s = {
      id: ID,
      name: 'Abeokuta Vet Store',
      phone: '+2348077777777',
      state: 'Ogun',
      lga: 'Abeokuta North',
      stock: ['lasota vaccine', 'broad spectrum antibiotic'],
      updatedAt: '2026-09-24T10:00:00.000Z',
    };
    expect(StoreSchema.safeParse(s).success).toBe(true);
  });

  it('defaults isOpen to true', () => {
    expect(
      StoreSchema.parse({
        id: ID,
        name: 'x',
        phone: '+2348077777777',
        state: 'O',
        lga: 'L',
        stock: [],
        updatedAt: '2026-09-24T10:00:00.000Z',
      }).isOpen,
    ).toBe(true);
  });

  it('accepts a store without stock', () => {
    expect(
      StoreSchema.safeParse({
        id: ID,
        name: 'x',
        phone: '+2348077777777',
        state: 'O',
        lga: 'L',
        stock: [],
        updatedAt: '2026-09-24T10:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('rejects an empty stock item', () => {
    expect(
      StoreSchema.safeParse({
        id: ID,
        name: 'x',
        phone: '+2348077777777',
        state: 'O',
        lga: 'L',
        stock: [''],
        updatedAt: '2026-09-24T10:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});