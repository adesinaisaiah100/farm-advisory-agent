import { drizzle } from 'drizzle-orm/pg-proxy';
import { describe, expect, it } from 'vitest';
import { apiSchema, type ApiDatabase } from './client.js';
import { postgresSessionStore } from './session-store.js';
import type { Session } from '@poultry/schemas';

interface CapturedQuery {
  sql: string;
  params: unknown[];
}

interface Capturing {
  db: ApiDatabase;
  captured: CapturedQuery[];
  rows: unknown[];
}

function makeDb(rows: unknown[] = []) {
  const captured: CapturedQuery[] = [];
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      captured.push({ sql, params });
      return { rows };
    },
    { schema: apiSchema },
  );
  return { db: db as unknown as ApiDatabase, captured, rows };
}

function capturing(rows: unknown[] = []): Capturing {
  const made = makeDb(rows);
  return { db: made.db, captured: made.captured, rows };
}

const SESSION: Session = {
  id: '11111111-1111-4111-8111-111111111111',
  phone: '+2348012345678',
  status: 'open',
  caseId: '22222222-2222-4222-8222-222222222222',
  state: {
    case: { status: 'in_progress', species: 'broiler' },
    missing: [],
    notes: [],
    stallCount: 0,
    updatedAt: '2026-09-28T09:00:00.000Z',
  },
  startedAt: '2026-09-28T08:00:00.000Z',
  lastActive: '2026-09-28T09:00:00.000Z',
};

/**
 * Positional tuples, not objects. Drizzle's `mapResultRow` reads a driver row by
 * column *index*, so an object-shaped fake maps every column to undefined while
 * still looking like a working double. Column order must match the table
 * definition in `schema.ts`.
 */
const COLUMNS = ['id', 'phone', 'status', 'case_id', 'state', 'started_at', 'last_active'] as const;

function rowOf(values: Partial<Record<(typeof COLUMNS)[number], unknown>> = {}) {
  const merged = {
    id: SESSION.id,
    phone: SESSION.phone,
    status: 'open',
    case_id: SESSION.caseId ?? null,
    state: SESSION.state,
    started_at: new Date(SESSION.startedAt),
    last_active: new Date(SESSION.lastActive),
    ...values,
  };
  return COLUMNS.map((column) => merged[column]);
}

describe('postgresSessionStore', () => {
  it('returns undefined when the farmer has no open session', async () => {
    const { db } = capturing();
    expect(await postgresSessionStore(db).openSession('+2348012345678')).toBeUndefined();
  });

  it('scopes the lookup to the open session, not the newest of many', async () => {
    const { db, captured } = capturing();
    await postgresSessionStore(db).openSession('+2348012345678');

    // The status is a bound parameter too, so the SQL text carries no literal
    // 'open'; asserting on params is what actually pins the behaviour.
    expect(captured[0]?.sql).toContain('"sessions"."status" = $2');
    expect(captured[0]?.params).toEqual(['+2348012345678', 'open', 1]);
  });

  it('binds the phone as a parameter rather than interpolating it', async () => {
    const { db, captured } = capturing();
    await postgresSessionStore(db).openSession("+2348012345678'; DROP TABLE sessions;--");

    expect(captured[0]?.params).toEqual(["+2348012345678'; DROP TABLE sessions;--", 'open', 1]);
    expect(captured[0]?.sql).not.toContain('DROP TABLE');
  });

  it('reparses the row into a Session, so a drifted row is caught here', async () => {
    const { db } = capturing([rowOf({ state: { case: { status: 'not_a_status' } } })]);

    // A hand-edited or older-build row is a corrupt conversation. Failing loudly
    // beats handing `runTurn` an object only TypeScript agreed was valid.
    await expect(
      postgresSessionStore(db).openSession('+2348012345678'),
    ).rejects.toThrow(/does not match the schema/);
  });

  it('converts the timestamp columns back to ISO strings', async () => {
    const { db } = capturing([rowOf()]);
    const loaded = await postgresSessionStore(db).openSession('+2348012345678');

    expect(loaded?.lastActive).toBe('2026-09-28T09:00:00.000Z');
  });

  it('drops a null case_id instead of handing `runTurn` a null case id', async () => {
    const { db } = capturing([rowOf({ case_id: null })]);
    const loaded = await postgresSessionStore(db).openSession('+2348012345678');

    expect(loaded).toBeDefined();
    expect(loaded?.caseId).toBeUndefined();
  });

  it('upserts on save so a retry does not fork the session', async () => {
    const { db, captured } = capturing();
    await postgresSessionStore(db).save(SESSION);

    expect(captured[0]?.sql).toContain('insert into "sessions"');
    expect(captured[0]?.sql).toContain('on conflict');
    expect(captured[0]?.params).toContain(SESSION.id);
  });

  it('stores caseId as SQL null when the case has no id yet', async () => {
    const { db, captured } = capturing();
    await postgresSessionStore(db).save({ ...SESSION, caseId: undefined });

    expect(captured[0]?.params).toContain(null);
  });

  it('closes only the open session, so a completed one is never reopened', async () => {
    const { db, captured } = capturing();
    await postgresSessionStore(db).close('+2348012345678', 'completed');

    expect(captured[0]?.sql).toContain('update "sessions"');
    expect(captured[0]?.sql).toContain('"sessions"."status" = $4');
    expect(captured[0]?.params[0]).toBe('completed');
    expect(captured[0]?.params.slice(2)).toEqual(['+2348012345678', 'open']);
  });
});
