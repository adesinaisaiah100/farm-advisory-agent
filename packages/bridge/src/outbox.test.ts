import { describe, expect, it } from 'vitest';
import { OUTBOX_MAX_BACKOFF_MS, type OutboxRecord } from '@poultry/schemas';
import {
  OutboxPoller,
  backoffFor,
  isDue,
  type Clock,
  type OutboxSender,
  type OutboxStore,
} from './outbox.js';

const AT = new Date('2026-09-28T00:00:00.000Z');
const FARMER = '+2348082974602';

let seq = 0;

function row(overrides: Partial<OutboxRecord> = {}): OutboxRecord {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    farmerPhone: FARMER,
    payload: { type: 'text', text: 'How can I help?' },
    status: 'pending',
    attempt: 0,
    maxAttempts: 5,
    createdAt: AT.toISOString(),
    ...overrides,
  };
}

class FakeClock implements Clock {
  #now: Date;
  constructor(now: Date) {
    this.#now = now;
  }
  now(): Date {
    return this.#now;
  }
  advance(ms: number): void {
    this.#now = new Date(this.#now.getTime() + ms);
  }
}

class FakeOutboxStore implements OutboxStore {
  readonly rows: OutboxRecord[];

  constructor(rows: OutboxRecord[] = []) {
    this.rows = rows;
  }

  async claimDue(now: Date, limit: number): Promise<OutboxRecord[]> {
    return this.rows.filter((candidate) => isDue(candidate, now)).slice(0, limit);
  }

  async markSent(id: string): Promise<void> {
    this.#find(id).status = 'sent';
  }

  async markFailed(id: string, attempt: number, nextAttemptAt: Date): Promise<void> {
    const target = this.#find(id);
    target.status = 'failed';
    target.attempt = attempt;
    target.nextAttemptAt = nextAttemptAt.toISOString();
  }

  async markDropped(id: string): Promise<void> {
    this.#find(id).status = 'dropped';
  }

  #find(id: string): OutboxRecord {
    const found = this.rows.find((candidate) => candidate.id === id);
    if (!found) throw new Error(`no such row ${id}`);
    return found;
  }
}

class FakeSender implements OutboxSender {
  readonly sent: string[] = [];
  readonly failing = new Set<string>();

  async send(target: OutboxRecord): Promise<void> {
    if (this.failing.has(target.id)) throw new Error('send failed');
    this.sent.push(target.id);
  }
}

function poller(
  store: FakeOutboxStore,
  sender: FakeSender,
  clock: Clock,
  batchSize?: number,
): OutboxPoller {
  return new OutboxPoller({ store, sender, clock, batchSize });
}

describe('isDue', () => {
  it('treats a pending row as due immediately', () => {
    expect(isDue(row({ status: 'pending' }), AT)).toBe(true);
  });

  it('treats a failed row as due once its backoff has elapsed', () => {
    const due = row({
      status: 'failed',
      attempt: 1,
      nextAttemptAt: new Date(AT.getTime() - 1).toISOString(),
    });
    expect(isDue(due, AT)).toBe(true);
  });

  it('holds a failed row back while its backoff is still running', () => {
    const waiting = row({
      status: 'failed',
      attempt: 1,
      nextAttemptAt: new Date(AT.getTime() + 1000).toISOString(),
    });
    expect(isDue(waiting, AT)).toBe(false);
  });

  it('never resends a row that already went out', () => {
    expect(isDue(row({ status: 'sent' }), AT)).toBe(false);
  });

  it('never resends a row that was given up on', () => {
    expect(isDue(row({ status: 'dropped' }), AT)).toBe(false);
  });

  it('never resends a row that has used every attempt', () => {
    const exhausted = row({ status: 'failed', attempt: 5, maxAttempts: 5 });
    expect(isDue(exhausted, AT)).toBe(false);
  });
});

describe('backoffFor', () => {
  it('starts at five seconds', () => {
    expect(backoffFor(1)).toBe(5_000);
  });

  it('doubles the wait after each failure', () => {
    expect(backoffFor(2)).toBe(10_000);
    expect(backoffFor(3)).toBe(20_000);
    expect(backoffFor(4)).toBe(40_000);
  });

  it('stops growing at five minutes', () => {
    expect(backoffFor(20)).toBe(OUTBOX_MAX_BACKOFF_MS);
  });
});

describe('OutboxPoller', () => {
  it('sends a due row and marks it sent', async () => {
    const due = row();
    const store = new FakeOutboxStore([due]);
    const sender = new FakeSender();

    const summary = await poller(store, sender, new FakeClock(AT)).runOnce();

    expect(summary).toEqual({ claimed: 1, sent: 1, retried: 0, dropped: 0 });
    expect(due.status).toBe('sent');
  });

  it('keeps sending later rows when one of them fails', async () => {
    const bad = row();
    const good = row();
    const store = new FakeOutboxStore([bad, good]);
    const sender = new FakeSender();
    sender.failing.add(bad.id);

    const summary = await poller(store, sender, new FakeClock(AT)).runOnce();

    expect(summary).toEqual({ claimed: 2, sent: 1, retried: 1, dropped: 0 });
    expect(sender.sent).toEqual([good.id]);
  });

  it('schedules the first retry five seconds out', async () => {
    const failing = row();
    const store = new FakeOutboxStore([failing]);
    const sender = new FakeSender();
    sender.failing.add(failing.id);

    await poller(store, sender, new FakeClock(AT)).runOnce();

    expect(failing.status).toBe('failed');
    expect(failing.attempt).toBe(1);
    expect(failing.nextAttemptAt).toBe(new Date(AT.getTime() + 5_000).toISOString());
  });

  it('walks the backoff up across consecutive failures', async () => {
    const failing = row();
    const store = new FakeOutboxStore([failing]);
    const sender = new FakeSender();
    sender.failing.add(failing.id);
    const clock = new FakeClock(AT);
    const runner = poller(store, sender, clock);

    await runner.runOnce();
    clock.advance(5_000);
    await runner.runOnce();
    clock.advance(10_000);
    await runner.runOnce();

    expect(failing.attempt).toBe(3);
    expect(failing.nextAttemptAt).toBe(new Date(clock.now().getTime() + 20_000).toISOString());
  });

  it('gives up on a row once every attempt is used', async () => {
    const failing = row({ maxAttempts: 2 });
    const store = new FakeOutboxStore([failing]);
    const sender = new FakeSender();
    sender.failing.add(failing.id);
    const clock = new FakeClock(AT);
    const runner = poller(store, sender, clock);

    await runner.runOnce();
    clock.advance(5_000);
    const summary = await runner.runOnce();

    expect(summary.dropped).toBe(1);
    expect(failing.status).toBe('dropped');
  });

  it('never sends a row whose backoff has not elapsed', async () => {
    const waiting = row({
      status: 'failed',
      attempt: 1,
      nextAttemptAt: new Date(AT.getTime() + 5_000).toISOString(),
    });
    const store = new FakeOutboxStore([waiting]);
    const sender = new FakeSender();

    const summary = await poller(store, sender, new FakeClock(AT)).runOnce();

    expect(summary.claimed).toBe(0);
    expect(sender.sent).toEqual([]);
  });

  it('sends at most one batch per poll', async () => {
    const rows = [row(), row(), row()];
    const store = new FakeOutboxStore(rows);
    const sender = new FakeSender();

    const summary = await poller(store, sender, new FakeClock(AT), 2).runOnce();

    expect(summary.claimed).toBe(2);
    expect(sender.sent).toHaveLength(2);
  });

  it('treats a row as failed when the send went out but the bookkeeping write did not', async () => {
    const flaky = row();
    const store = new FakeOutboxStore([flaky]);
    const sender = new FakeSender();
    const brokenStore: OutboxStore = {
      claimDue: (now, limit) => store.claimDue(now, limit),
      markSent: async () => {
        throw new Error('database unavailable');
      },
      markFailed: (id, attempt, nextAttemptAt) => store.markFailed(id, attempt, nextAttemptAt),
      markDropped: (id) => store.markDropped(id),
    };

    const summary = await new OutboxPoller({
      store: brokenStore,
      sender,
      clock: new FakeClock(AT),
    }).runOnce();

    expect(summary.retried).toBe(1);
    expect(flaky.status).toBe('failed');
  });

  it('leaves a row retryable when the failure bookkeeping write also fails', async () => {
    const failing = row();
    const store = new FakeOutboxStore([failing]);
    const sender = new FakeSender();
    sender.failing.add(failing.id);
    const silentStore: OutboxStore = {
      claimDue: (now, limit) => store.claimDue(now, limit),
      markSent: (id) => store.markSent(id),
      markFailed: async () => {
        throw new Error('database unavailable');
      },
      markDropped: (id) => store.markDropped(id),
    };

    const summary = await new OutboxPoller({
      store: silentStore,
      sender,
      clock: new FakeClock(AT),
    }).runOnce();

    expect(summary.retried).toBe(1);
    expect(failing.status).toBe('pending');
  });

  it('never records a row as given up when the drop bookkeeping write fails', async () => {
    const failing = row({ maxAttempts: 1 });
    const store = new FakeOutboxStore([failing]);
    const sender = new FakeSender();
    sender.failing.add(failing.id);
    const silentStore: OutboxStore = {
      claimDue: (now, limit) => store.claimDue(now, limit),
      markSent: (id) => store.markSent(id),
      markFailed: (id, attempt, nextAttemptAt) => store.markFailed(id, attempt, nextAttemptAt),
      markDropped: async () => {
        throw new Error('database unavailable');
      },
    };

    const summary = await new OutboxPoller({
      store: silentStore,
      sender,
      clock: new FakeClock(AT),
    }).runOnce();

    expect(summary.dropped).toBe(1);
    expect(failing.status).toBe('pending');
  });

  it('runs on an interval and can be stopped', async () => {
    const store = new FakeOutboxStore([row()]);
    const sender = new FakeSender();
    const runner = poller(store, sender, new FakeClock(AT));

    expect(runner.isRunning).toBe(false);
    runner.start(5);
    expect(runner.isRunning).toBe(true);
    runner.start(5);
    runner.stop();
    expect(runner.isRunning).toBe(false);
  });
});
