import { eq } from 'drizzle-orm';
import type { ApiDatabase } from './client.js';
import { farmers } from './schema.js';

export interface StoredFarmer {
  readonly phone: string;
  readonly name?: string;
  readonly state?: string;
  readonly lga?: string;
  readonly farmSize?: number;
  readonly species?: string;
  readonly preferredLang?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FarmerStore {
  getFarmer(phone: string): Promise<StoredFarmer | undefined>;
  upsertFarmer(profile: {
    phone: string;
    name?: string;
    state?: string;
    lga?: string;
    farmSize?: number;
    species?: string;
    preferredLang?: string;
  }): Promise<void>;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 350): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return withRetry(fn, retries - 1, delayMs * 1.5);
    }
    throw err;
  }
}

export function postgresFarmerStore(db: ApiDatabase): FarmerStore {
  return {
    async getFarmer(phone) {
      const rows = await withRetry(() =>
        db
          .select()
          .from(farmers)
          .where(eq(farmers.phone, phone))
          .limit(1)
      );

      const row = rows[0];
      if (!row) return undefined;

      return {
        phone: row.phone,
        name: row.name ?? undefined,
        state: row.state ?? undefined,
        lga: row.lga ?? undefined,
        farmSize: row.farmSize ?? undefined,
        species: row.species ?? undefined,
        preferredLang: row.preferredLang ?? undefined,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    },

    async upsertFarmer(profile) {
      const now = new Date();
      const existing = await withRetry(() =>
        db
          .select()
          .from(farmers)
          .where(eq(farmers.phone, profile.phone))
          .limit(1)
      );

      const current = existing[0];

      const merged = {
        phone: profile.phone,
        name: profile.name ?? current?.name ?? null,
        state: profile.state ?? current?.state ?? null,
        lga: profile.lga ?? current?.lga ?? null,
        farmSize: profile.farmSize ?? current?.farmSize ?? null,
        species: profile.species ?? current?.species ?? null,
        preferredLang: profile.preferredLang ?? current?.preferredLang ?? null,
        updatedAt: now,
      };

      await withRetry(() =>
        db
          .insert(farmers)
          .values({
            ...merged,
            createdAt: current?.createdAt ?? now,
          })
          .onConflictDoUpdate({
            target: farmers.phone,
            set: {
              name: merged.name,
              state: merged.state,
              lga: merged.lga,
              farmSize: merged.farmSize,
              species: merged.species,
              preferredLang: merged.preferredLang,
              updatedAt: now,
            },
          })
      );
    },
  };
}
