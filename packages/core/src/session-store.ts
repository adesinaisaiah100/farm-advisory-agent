import type { Session, SessionState, SessionStatus } from '@poultry/schemas';

/**
 * Where a conversation lives between messages.
 *
 * `runTurn` is a pure function: it takes a `SessionState` and returns the next
 * one. Without something holding that state, a farmer's second message starts
 * from a blank case and the agent re-asks what the farmer already answered,
 * which is the fastest way to lose them.
 *
 * Keyed by E.164 phone rather than by session id alone, because the WhatsApp
 * bridge identifies a conversation by who is writing and only then by which
 * session is open. One open session per farmer is the MVP's rule; reopening a
 * completed case is a dashboard decision, not a transport one.
 *
 * The session holds the case and the working notes but not the raw transcript.
 * The caller replays the transcript on each turn, which is also why `runTurn`
 * bounds it by compaction instead of the store persisting it forever.
 */
export interface SessionStore {
  openSession(phone: string): Promise<Session | undefined>;
  save(session: Session): Promise<void>;
  close(phone: string, status: SessionStatus): Promise<void>;
}

export interface SessionStoreOptions {
  readonly now: () => Date;
  readonly newId: () => string;
}

export function inMemorySessionStore(options: SessionStoreOptions): SessionStore {
  const stored = new Map<string, Session>();

  return {
    async openSession(phone) {
      const session = stored.get(phone);
      // A closed session is kept, because the dashboard will want the case
      // history. Returning it here would silently reopen a completed
      // conversation, and the next turn would build on stale state. The Postgres
      // store filters on `status = 'open'` for the same reason: the two stores
      // must not disagree about what "open" means, or dev and production would
      // behave differently.
      if (session === undefined || session.status !== 'open') return undefined;
      return session;
    },

    async save(session) {
      stored.set(session.phone, session);
    },

    async close(phone, status) {
      const existing = stored.get(phone);
      // Mirrors the Postgres store's `status = 'open'` predicate. A farmer who
      // already discharged a case must not have it silently relabelled by a
      // retried close, and the two stores must not disagree about this.
      if (existing === undefined || existing.status !== 'open') return;
      stored.set(phone, { ...existing, status, lastActive: options.now().toISOString() });
    },
  };
}

export function newSession(phone: string, state: SessionState, options: SessionStoreOptions): Session {
  const startedAt = options.now().toISOString();
  return {
    id: options.newId(),
    phone,
    status: 'open',
    state,
    startedAt,
    lastActive: startedAt,
  };
}
