import { drizzle } from 'drizzle-orm/pg-proxy';
import { describe, expect, it } from 'vitest';
import { apiSchema, type ApiDatabase } from './client.js';
import { postgresFarmerStore } from './farmer-store.js';

interface CapturedQuery {
  sql: string;
  params: unknown[];
}

function makeDb(rows: unknown[] = []) {
  const captured: CapturedQuery[] = [];
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      captured.push({ sql, params });
      return { rows };
    },
    { schema: apiSchema },
  );
  return { db: db as unknown as ApiDatabase, captured };
}

const FARMER_COLUMNS = [
  'phone',
  'name',
  'state',
  'lga',
  'farm_size',
  'species',
  'preferred_lang',
  'created_at',
  'updated_at',
] as const;

function farmerRow(values: Partial<Record<(typeof FARMER_COLUMNS)[number], unknown>> = {}) {
  const merged = {
    phone: '+2349155132405',
    name: 'Biola',
    state: 'Oyo',
    lga: 'Ibadan North',
    farm_size: 500,
    species: 'broiler',
    preferred_lang: 'pcm',
    created_at: new Date('2026-09-28T08:00:00.000Z'),
    updated_at: new Date('2026-09-28T09:00:00.000Z'),
    ...values,
  };
  return FARMER_COLUMNS.map((col) => merged[col]);
}

describe('postgresFarmerStore', () => {
  it('returns undefined when no farmer profile exists', async () => {
    const { db } = makeDb([]);
    const store = postgresFarmerStore(db);
    const result = await store.getFarmer('+2349155132405');
    expect(result).toBeUndefined();
  });

  it('reads stored farmer profile cleanly', async () => {
    const { db } = makeDb([farmerRow()]);
    const store = postgresFarmerStore(db);
    const result = await store.getFarmer('+2349155132405');
    expect(result).toEqual({
      phone: '+2349155132405',
      name: 'Biola',
      state: 'Oyo',
      lga: 'Ibadan North',
      farmSize: 500,
      species: 'broiler',
      preferredLang: 'pcm',
      createdAt: '2026-09-28T08:00:00.000Z',
      updatedAt: '2026-09-28T09:00:00.000Z',
    });
  });

  it('upserts a farmer profile on insert / conflict', async () => {
    const { db, captured } = makeDb([]);
    const store = postgresFarmerStore(db);
    await store.upsertFarmer({
      phone: '+2349155132405',
      name: 'Biola',
      lga: 'Ibadan North',
      state: 'Oyo',
      farmSize: 500,
      species: 'broiler',
    });

    expect(captured.length).toBeGreaterThanOrEqual(1);
    const insertQuery = captured.find((c) => c.sql.includes('insert into "farmers"'));
    expect(insertQuery).toBeDefined();
    expect(insertQuery?.sql).toContain('on conflict ("phone") do update');
  });
});
