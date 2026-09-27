import type { AgroStore } from '@poultry/schemas';
import { STORES } from './data/stores.js';

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function verifiedStock(store: AgroStore): readonly string[] {
  if (store.stock === undefined || store.stockVerifiedAt === undefined) return [];
  return store.stock;
}

export function hasStock(store: AgroStore, item: string): boolean {
  const wanted = normalize(item);
  if (wanted.length === 0) return false;
  return verifiedStock(store).some((entry) => normalize(entry) === wanted);
}

export interface ReferralQuery {
  lga?: string;
  state?: string;
}

function matchesLocation(store: AgroStore, query: ReferralQuery): boolean {
  if (query.lga !== undefined && normalize(store.lga) !== normalize(query.lga)) {
    return false;
  }
  if (query.state !== undefined && normalize(store.state) !== normalize(query.state)) {
    return false;
  }
  return true;
}

export function searchByLga(lga: string, state?: string): AgroStore[] {
  const wantedLga = normalize(lga);
  if (wantedLga.length === 0) return [];
  return STORES.filter(
    (store) =>
      normalize(store.lga) === wantedLga &&
      (state === undefined || normalize(store.state) === normalize(state)),
  );
}

// Nothing in the seed has confirmed stock, so a referral is chosen on location alone.
// The stock preference returned once a real partner opts in and supplies stockVerifiedAt.
export function pickReferral(query: ReferralQuery = {}): AgroStore | undefined {
  const candidates = STORES.filter((store) => matchesLocation(store, query));
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((a, b) => a.name.localeCompare(b.name))[0];
}

export function coveredLgas(): Array<{ lga: string; state: string }> {
  const unique = new Map<string, { lga: string; state: string }>();
  for (const store of STORES) {
    const key = `${normalize(store.lga)}|${normalize(store.state)}`;
    if (!unique.has(key)) {
      unique.set(key, { lga: store.lga, state: store.state });
    }
  }
  return [...unique.values()].sort(
    (a, b) => a.state.localeCompare(b.state) || a.lga.localeCompare(b.lga),
  );
}
