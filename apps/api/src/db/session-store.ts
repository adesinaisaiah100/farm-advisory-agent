import { and, desc, eq } from 'drizzle-orm';
import { SessionSchema } from '@poultry/schemas';
import type { SessionStore } from '@poultry/core';
import type { ApiDatabase } from './client.js';
import { sessions } from './schema.js';

/**
 * The Postgres-backed store. Everything crossing this boundary is reparsed with
 * `SessionSchema`, because a row written by an older build, a hand-edited row, or
 * a `jsonb` column carrying a shape the schema no longer accepts would otherwise
 * arrive in `runTurn` as a `Session` that only TypeScript agreed was valid. A
 * malformed row is a corrupt conversation, and the farmer should get a fresh one
 * rather than a turn built on garbage.
 */
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

export function postgresSessionStore(db: ApiDatabase): SessionStore {
  return {
    async openSession(phone) {
      const rows = await withRetry(() =>
        db
          .select()
          .from(sessions)
          .where(and(eq(sessions.phone, phone), eq(sessions.status, 'open')))
          .limit(1)
      );

      const row = rows[0];
      if (row === undefined) return undefined;

      // A nullable column has to be *removed*, not overwritten: spreading `{}`
      // over `caseId: null` leaves the null in place, and `SessionSchema` wants
      // the key absent.
      const { caseId, ...rest } = row;

      const parsed = SessionSchema.safeParse({
        ...rest,
        startedAt: rest.startedAt.toISOString(),
        lastActive: rest.lastActive.toISOString(),
        ...(caseId === null ? {} : { caseId }),
      });

      if (!parsed.success) {
        throw new Error(
          `stored session for ${phone} does not match the schema: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    },

    async latestSession(phone) {
      const rows = await withRetry(() =>
        db
          .select()
          .from(sessions)
          .where(eq(sessions.phone, phone))
          .orderBy(desc(sessions.lastActive))
          .limit(1)
      );

      const row = rows[0];
      if (row === undefined) return undefined;

      const { caseId, ...rest } = row;
      const parsed = SessionSchema.safeParse({
        ...rest,
        startedAt: rest.startedAt.toISOString(),
        lastActive: rest.lastActive.toISOString(),
        ...(caseId === null ? {} : { caseId }),
      });

      return parsed.success ? parsed.data : undefined;
    },

    async save(session) {
      await withRetry(() =>
        db
          .insert(sessions)
          .values({
            id: session.id,
            phone: session.phone,
            status: session.status,
            state: session.state,
            startedAt: new Date(session.startedAt),
            lastActive: new Date(session.lastActive),
            caseId: session.caseId ?? null,
          })
          .onConflictDoUpdate({
            target: sessions.id,
            set: {
              status: session.status,
              state: session.state,
              lastActive: new Date(session.lastActive),
              caseId: session.caseId ?? null,
            },
          })
      );
    },

    async close(phone, status) {
      // Scoped to `status = 'open'` so closing twice is a no-op rather than
      // reopening a completed conversation, and so a farmer's *current* case is
      // the only thing a stray close can touch.
      await withRetry(() =>
        db
          .update(sessions)
          .set({ status, lastActive: new Date() })
          .where(and(eq(sessions.phone, phone), eq(sessions.status, 'open')))
      );
    },
  };
}
