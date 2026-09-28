import { describe, expect, it } from 'vitest';
import { SessionStateSchema, type Session, type SessionState } from '@poultry/schemas';
import { inMemorySessionStore, newSession } from './session-store.js';

const NOW = new Date('2026-09-28T10:00:00.000Z');

const PHONE = '+2348012345678';

function stateOf(): SessionState {
  return SessionStateSchema.parse({
    case: { status: 'in_progress' },
    updatedAt: NOW.toISOString(),
  });
}

function optionsOf(overrides: Partial<{ now: () => Date; newId: () => string }> = {}) {
  return {
    now: () => NOW,
    newId: () => 'session-1',
    ...overrides,
  };
}

function openSession(newId = 'session-1'): Session {
  return newSession(PHONE, stateOf(), optionsOf({ newId: () => newId }));
}

describe('newSession', () => {
  it('stamps both timestamps from the same clock read', () => {
    const session = newSession(PHONE, stateOf(), optionsOf());

    expect(session.startedAt).toBe(NOW.toISOString());
    expect(session.lastActive).toBe(NOW.toISOString());
  });

  it('opens the session and mints its id', () => {
    const session = newSession(PHONE, stateOf(), optionsOf({ newId: () => 'abc' }));

    expect(session).toMatchObject({ id: 'abc', phone: PHONE, status: 'open' });
  });
});

describe('inMemorySessionStore.openSession', () => {
  it('returns undefined for a farmer who has never written in', async () => {
    const store = inMemorySessionStore(optionsOf());

    expect(await store.openSession(PHONE)).toBeUndefined();
  });

  it('returns the saved session', async () => {
    const store = inMemorySessionStore(optionsOf());
    const session = openSession();
    await store.save(session);

    expect(await store.openSession(PHONE)).toEqual(session);
  });

  it('returns undefined after close, so a completed case is never reopened', async () => {
    const store = inMemorySessionStore(optionsOf());
    await store.save(openSession());
    await store.close(PHONE, 'completed');

    // Reopening would let the next turn build on the terminal state of a case the
    // farmer had already been discharged from.
    expect(await store.openSession(PHONE)).toBeUndefined();
  });

  it('keeps sessions for different farmers apart', async () => {
    const store = inMemorySessionStore(optionsOf({ newId: () => 'session-1' }));
    await store.save(openSession('session-1'));
    await store.save(newSession('+2348099999999', stateOf(), optionsOf({ newId: () => 'session-2' })));
    await store.close(PHONE, 'completed');

    // Closing one farmer's case must not touch another's.
    expect((await store.openSession('+2348099999999'))?.id).toBe('session-2');
  });
});

describe('inMemorySessionStore.close', () => {
  it('resolves for a farmer with no session', async () => {
    const store = inMemorySessionStore(optionsOf());

    await expect(store.close(PHONE, 'completed')).resolves.toBeUndefined();
  });

  it('is idempotent, so a retried close cannot revive the session', async () => {
    const store = inMemorySessionStore(optionsOf());
    await store.save(openSession());

    await store.close(PHONE, 'completed');
    // A second close is a no-op rather than a relabel of an already-closed case.
    await store.close(PHONE, 'void');

    expect(await store.openSession(PHONE)).toBeUndefined();
  });

  it('lets a farmer start a new case the day after the old one closed', async () => {
    const store = inMemorySessionStore(optionsOf());
    await store.save(openSession('session-1'));
    await store.close(PHONE, 'completed');

    // A store that refused this would make every farmer a one-case-per-lifetime
    // user, which is the opposite of "open the chat tomorrow".
    await store.save(openSession('session-2'));

    expect((await store.openSession(PHONE))?.id).toBe('session-2');
  });
});

describe('inMemorySessionStore.save', () => {
  it('replaces the session for a phone rather than appending', async () => {
    const store = inMemorySessionStore(optionsOf());
    await store.save(openSession('session-1'));
    await store.save(openSession('session-2'));

    expect((await store.openSession(PHONE))?.id).toBe('session-2');
  });
});
