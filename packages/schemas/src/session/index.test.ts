import { describe, expect, it } from 'vitest';
import { canTransition, SessionSchema, transitionSession } from './index.js';
import type { SessionStatus } from './index.js';

const ID = '9d47f8cd-4b6f-4f1a-8a6b-9ae1aef9b701';
const WHEN = '2026-09-24T10:00:00.000Z';

function session(status: SessionStatus) {
  return {
    id: ID,
    phone: '+2348012345678',
    status,
    state: { case: { status: 'in_progress' }, missing: ['symptoms'], updatedAt: WHEN },
    startedAt: WHEN,
    lastActive: WHEN,
  };
}

describe('SessionSchema', () => {
  it('accepts an open session', () => {
    expect(SessionSchema.safeParse(session('open')).success).toBe(true);
  });

  it('defaults missing, notes and stallCount', () => {
    const parsed = SessionSchema.parse({ ...session('open'), state: { case: { status: 'in_progress' }, updatedAt: WHEN } });
    expect(parsed.state.missing).toEqual([]);
    expect(parsed.state.notes).toEqual([]);
    expect(parsed.state.stallCount).toBe(0);
  });

  it('accepts a positive stallCount', () => {
    const stalling = {
      ...session('open'),
      state: { case: { status: 'in_progress' }, missing: [], notes: [], stallCount: 3, updatedAt: WHEN },
    };
    expect(SessionSchema.safeParse(stalling).success).toBe(true);
  });

  it('rejects a negative stallCount', () => {
    const bad = {
      ...session('open'),
      state: { case: { status: 'in_progress' }, missing: [], stallCount: -1, updatedAt: WHEN },
    };
    expect(SessionSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts session notes (compacted facts)', () => {
    const withNotes = {
      ...session('open'),
      state: {
        case: { status: 'in_progress' },
        missing: ['symptoms'],
        notes: ['already gave amprolium 3 days ago'],
        updatedAt: WHEN,
      },
    };
    expect(SessionSchema.safeParse(withNotes).success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const bad = { ...session('open'), status: 'done' };
    expect(SessionSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an invalid case status inside state', () => {
    const bad = {
      ...session('open'),
      state: { case: { status: 'open' }, missing: [], updatedAt: WHEN },
    };
    expect(SessionSchema.safeParse(bad).success).toBe(false);
  });
});

describe('canTransition', () => {
  it('allows open -> completed', () => {
    expect(canTransition('open', 'completed')).toBe(true);
  });

  it('allows open -> void', () => {
    expect(canTransition('open', 'void')).toBe(true);
  });

  it('allows completed -> void (reopen/clarify)', () => {
    expect(canTransition('completed', 'void')).toBe(true);
  });

  it('does not allow completed -> open', () => {
    expect(canTransition('completed', 'open')).toBe(false);
  });

  it('does not allow any transition out of void', () => {
    expect(canTransition('void', 'open')).toBe(false);
    expect(canTransition('void', 'completed')).toBe(false);
  });
});

describe('transitionSession', () => {
  it('returns the next status on a legal transition', () => {
    expect(transitionSession('open', 'completed')).toBe('completed');
  });

  it('throws on an illegal transition', () => {
    expect(() => transitionSession('void', 'open')).toThrow(/invalid session transition/);
  });
});