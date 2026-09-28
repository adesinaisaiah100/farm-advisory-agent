import { OUTBOX_BASE_BACKOFF_MS, OUTBOX_MAX_BACKOFF_MS, type OutboxRecord } from '@poultry/schemas';

export interface OutboxStore {
  /** Rows eligible to send now, oldest first. The store owns concurrency, so two pollers cannot double-send. */
  claimDue(now: Date, limit: number): Promise<OutboxRecord[]>;
  markSent(id: string, now: Date): Promise<void>;
  markFailed(id: string, attempt: number, nextAttemptAt: Date, now: Date): Promise<void>;
  markDropped(id: string, now: Date): Promise<void>;
}

export interface OutboxSender {
  send(row: OutboxRecord): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export function isDue(row: OutboxRecord, now: Date): boolean {
  if (row.status === 'pending') return true;
  if (row.status !== 'failed') return false;
  if (row.attempt >= row.maxAttempts) return false;
  return row.nextAttemptAt === undefined || new Date(row.nextAttemptAt).getTime() <= now.getTime();
}

export function backoffFor(attempt: number): number {
  if (attempt < 1) return OUTBOX_BASE_BACKOFF_MS;
  const scaled = OUTBOX_BASE_BACKOFF_MS * 2 ** (attempt - 1);
  return Math.min(scaled, OUTBOX_MAX_BACKOFF_MS);
}

export type SendOutcome = 'sent' | 'retry_scheduled' | 'dropped';

export interface PollSummary {
  readonly claimed: number;
  readonly sent: number;
  readonly retried: number;
  readonly dropped: number;
}

export interface OutboxPollerDeps {
  readonly store: OutboxStore;
  readonly sender: OutboxSender;
  readonly clock: Clock;
  readonly batchSize?: number;
}

export class OutboxPoller {
  readonly #store: OutboxStore;
  readonly #sender: OutboxSender;
  readonly #clock: Clock;
  readonly #batchSize: number;
  #timer: ReturnType<typeof setInterval> | undefined;
  #running = false;

  constructor(deps: OutboxPollerDeps) {
    this.#store = deps.store;
    this.#sender = deps.sender;
    this.#clock = deps.clock;
    this.#batchSize = deps.batchSize ?? 20;
  }

  async runOnce(): Promise<PollSummary> {
    const now = this.#clock.now();
    const due = (await this.#store.claimDue(now, this.#batchSize)).filter((row) => isDue(row, now));

    let sent = 0;
    let retried = 0;
    let dropped = 0;

    for (const row of due) {
      const outcome = await this.#send(row);
      if (outcome === 'sent') sent += 1;
      else if (outcome === 'dropped') dropped += 1;
      else retried += 1;
    }

    return { claimed: due.length, sent, retried, dropped };
  }

  async #send(row: OutboxRecord): Promise<SendOutcome> {
    const now = this.#clock.now();
    try {
      await this.#sender.send(row);
    } catch {
      return this.#recordFailure(row, now);
    }

    try {
      await this.#store.markSent(row.id, now);
      return 'sent';
    } catch {
      return this.#recordFailure(row, now);
    }
  }

  async #recordFailure(row: OutboxRecord, now: Date): Promise<SendOutcome> {
    const attempt = row.attempt + 1;
    if (attempt >= row.maxAttempts) {
      try {
        await this.#store.markDropped(row.id, now);
      } catch {
        // Nothing left to escalate to: the row stays due and will be retried, which is safer than
        // forgetting a farmer's undelivered message.
      }
      return 'dropped';
    }

    const nextAttemptAt = new Date(now.getTime() + backoffFor(attempt));
    try {
      await this.#store.markFailed(row.id, attempt, nextAttemptAt, now);
    } catch {
      // Same reasoning as above; a lost bookkeeping write must not be read as a delivered message.
    }
    return 'retry_scheduled';
  }

  start(intervalMs: number): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => {
      if (this.#running) return;
      this.#running = true;
      void this.runOnce().finally(() => {
        this.#running = false;
      });
    }, intervalMs);
    this.#timer.unref?.();
  }

  stop(): void {
    if (!this.#timer) return;
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  get isRunning(): boolean {
    return this.#timer !== undefined;
  }
}
