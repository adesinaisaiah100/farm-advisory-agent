import { describe, expect, it } from 'vitest';
import { canRetry, OutboxSchema } from './index.js';
import type { OutboxRecord } from './index.js';

const ID = '9d47f8cd-4b6f-4f1a-8a6b-9ae1aef9b701';
const WHEN = '2026-09-24T10:00:00.000Z';

function record(overrides: Partial<OutboxRecord> = {}): OutboxRecord {
  return OutboxSchema.parse({
    id: ID,
    farmerPhone: '+2348012345678',
    payload: { type: 'text', text: 'hello' },
    status: 'pending',
    attempt: 0,
    createdAt: WHEN,
    ...overrides,
  });
}

describe('OutboxSchema', () => {
  it('accepts a pending text outbox row', () => {
    expect(OutboxSchema.safeParse(record({})).success).toBe(true);
  });

  it('accepts a referral-slip payload', () => {
    expect(
      OutboxSchema.safeParse(record({ payload: { type: 'referral_slip', slipId: ID } })).success,
    ).toBe(true);
  });

  it('defaults attempt to 0 and maxAttempts to 5', () => {
    const row = OutboxSchema.parse(record({}));
    expect(row.attempt).toBe(0);
    expect(row.maxAttempts).toBe(5);
  });

  it('rejects a payload with no recognized variant', () => {
    expect(
      OutboxSchema.safeParse({
        id: ID,
        farmerPhone: '+2348012345678',
        payload: { type: 'text', slipId: ID },
        status: 'pending',
        createdAt: WHEN,
      }).success,
    ).toBe(false);
  });

  it('rejects an attempt count above maxAttempts', () => {
    expect(
      OutboxSchema.safeParse({
        ...record({}),
        attempt: 6,
        maxAttempts: 5,
      }).success,
    ).toBe(false);
  });
});

describe('canRetry', () => {
  it('allows a retry under the attempt cap', () => {
    expect(canRetry(record({ status: 'failed', attempt: 2 }))).toBe(true);
  });

  it('blocks retry when attempts are exhausted', () => {
    expect(canRetry(record({ status: 'failed', attempt: 5, maxAttempts: 5 }))).toBe(false);
  });

  it('blocks retry for non-failed statuses', () => {
    expect(canRetry(record({ status: 'pending' }))).toBe(false);
    expect(canRetry(record({ status: 'sent' }))).toBe(false);
  });
});