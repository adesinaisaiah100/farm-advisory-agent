import { describe, expect, it } from 'vitest';
import { DEDUP_TTL_MS, Deduplicator, InMemoryDedupStore, type DedupStore } from './dedup.js';

const AT = new Date('2026-09-28T00:00:00.000Z');

function hoursAfter(hours: number): Date {
  return new Date(AT.getTime() + hours * 60 * 60 * 1000);
}

describe('InMemoryDedupStore', () => {
  it('accepts a message id it has not seen', async () => {
    expect(await new InMemoryDedupStore().claim('wa-1', AT)).toBe(true);
  });

  it('rejects a message id it has already seen', async () => {
    const store = new InMemoryDedupStore();
    await store.claim('wa-1', AT);
    expect(await store.claim('wa-1', hoursAfter(1))).toBe(false);
  });

  it('keeps rejecting a duplicate for the full day', async () => {
    const store = new InMemoryDedupStore();
    await store.claim('wa-1', AT);
    expect(await store.claim('wa-1', new Date(AT.getTime() + DEDUP_TTL_MS - 1))).toBe(false);
  });

  it('accepts the same id again once the day has passed, because redelivery can be that old', async () => {
    const store = new InMemoryDedupStore();
    await store.claim('wa-1', AT);
    expect(await store.claim('wa-1', new Date(AT.getTime() + DEDUP_TTL_MS))).toBe(true);
  });

  it('keeps different message ids apart', async () => {
    const store = new InMemoryDedupStore();
    expect(await store.claim('wa-1', AT)).toBe(true);
    expect(await store.claim('wa-2', AT)).toBe(true);
  });

  it('forgets expired ids so a long-lived host does not grow without bound', async () => {
    const store = new InMemoryDedupStore();
    for (let i = 0; i < 1001; i += 1) await store.claim(`wa-${i}`, AT);
    expect(store.size).toBe(1001);

    await store.claim('wa-after-the-day', new Date(AT.getTime() + DEDUP_TTL_MS));

    expect(store.size).toBe(1);
  });
});

describe('Deduplicator', () => {
  it('reports the first delivery of a message', async () => {
    expect(await new Deduplicator(new InMemoryDedupStore()).accept('wa-1', AT)).toEqual({
      accepted: true,
    });
  });

  it('names the reason a redelivered message is dropped', async () => {
    const dedup = new Deduplicator(new InMemoryDedupStore());
    await dedup.accept('wa-1', AT);
    expect(await dedup.accept('wa-1', AT)).toEqual({ accepted: false, reason: 'duplicate' });
  });

  it('drops a redelivery through any store, not just the in-memory one', async () => {
    const claims: string[] = [];
    const store: DedupStore = {
      claim: async (key) => {
        if (claims.includes(key)) return false;
        claims.push(key);
        return true;
      },
    };
    const dedup = new Deduplicator(store);
    expect((await dedup.accept('wa-1', AT)).accepted).toBe(true);
    expect((await dedup.accept('wa-1', AT)).accepted).toBe(false);
  });
});
