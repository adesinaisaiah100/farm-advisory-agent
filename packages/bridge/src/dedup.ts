export const DEDUP_TTL_MS = 24 * 60 * 60 * 1000;

const PRUNE_THRESHOLD = 1000;

/**
 * Check-and-set in a single call. A `has`-then-`add` pair would let two handlers that read the same
 * upsert batch both conclude the message is new, and WhatsApp reconnect flows redeliver the tail of the
 * stream, so that race is reachable rather than theoretical.
 */
export interface DedupStore {
  claim(key: string, now: Date): Promise<boolean>;
}

export class InMemoryDedupStore implements DedupStore {
  readonly #seen = new Map<string, number>();

  async claim(key: string, now: Date): Promise<boolean> {
    const nowMs = now.getTime();
    const expiresAt = this.#seen.get(key);
    if (expiresAt !== undefined && expiresAt > nowMs) return false;

    this.#seen.set(key, nowMs + DEDUP_TTL_MS);
    if (this.#seen.size > PRUNE_THRESHOLD) this.#prune(nowMs);
    return true;
  }

  get size(): number {
    return this.#seen.size;
  }

  #prune(nowMs: number): void {
    for (const [key, expiresAt] of this.#seen) {
      if (expiresAt <= nowMs) this.#seen.delete(key);
    }
  }
}

export type AcceptResult =
  { readonly accepted: true } | { readonly accepted: false; readonly reason: 'duplicate' };

export class Deduplicator {
  readonly #store: DedupStore;

  constructor(store: DedupStore) {
    this.#store = store;
  }

  async accept(waMsgId: string, now: Date): Promise<AcceptResult> {
    const fresh = await this.#store.claim(waMsgId, now);
    return fresh ? { accepted: true } : { accepted: false, reason: 'duplicate' };
  }
}
