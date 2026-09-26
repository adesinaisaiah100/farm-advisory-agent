import type { AgroStore } from '@poultry/schemas';
import { STORES } from './data/stores.js';

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function hasStock(store: AgroStore, item: string): boolean {
  const wanted = normalize(item);
  if (wanted.length === 0) return false;
  return store.stock.some((entry) => normalize(entry) === wanted);
}

export interface ReferralQuery {
  lga?: string;
  state?: string;
  item?: string;
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
      (state === undefined || normalize(store.state) === normalize(state))
  );
}

export function pickReferral(query: ReferralQuery = {}): AgroStore | undefined {
  const candidates = STORES.filter((store) => matchesLocation(store, query));
  if (candidates.length === 0) return undefined;

  let pool = candidates;
  if (query.item !== undefined) {
    const stocked = pool.filter((store) => hasStock(store, query.item as string));
    if (stocked.length > 0) pool = stocked;
  }

  const open = pool.filter((store) => store.isOpen);
  if (open.length > 0) pool = open;

  return [...pool].sort((a, b) => a.name.localeCompare(b.name))[0];
}

export function coveredLgas(): Array<{ lga: string; state: string }> {
  const unique = new Map<string, { lga: string; state: string }>();
  for (const store of STORES) {
    const key = `${normalize(store.lga)}|${normalize(store.state)}`;
    if (!unique.has(key)) {
      unique.set(key, { lga: store.lga, state: store.state });
    }
  }
  return [...unique.values()].sort((a, b) =>
    a.state.localeCompare(b.state) || a.lga.localeCompare(b.lga)
  );
}
