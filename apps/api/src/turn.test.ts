import { describe, expect, it } from 'vitest';
import type { Session, SessionStatus } from '@poultry/schemas';
import { inMemorySessionStore } from '@poultry/core';
import type { ChatProvider, CompactProvider, TurnDeps } from '@poultry/core';
import { LlmError } from '@poultry/core';
import { handleChat, RequestError } from './turn.js';
import type { TurnServiceDeps } from './turn.js';

const NOW = new Date('2026-09-28T09:00:00.000Z');

/** Deterministic ids: a test asserting against a random uuid proves nothing. */
function newId(): string {
  return '00000000-0000-4000-8000-000000000001';
}

/**
 * A real in-memory store that also records every write.
 *
 * `openSession` deliberately refuses to return a closed session, because that is
 * the behaviour production needs. A test asserting what was *persisted* after a
 * close therefore has to observe the write, and the honest way to do that is a
 * fake that records — not a store contract loosened to make tests convenient.
 */
function makeStore() {
  const base = inMemorySessionStore({ now: () => NOW, newId });
  const writes: Session[] = [];
  return {
    writes,
    lastWritten: (): Session | undefined => writes.at(-1),
    openSession: (phone: string) => base.openSession(phone),
    save: async (session: Session) => {
      writes.push(session);
      await base.save(session);
    },
    close: async (phone: string, status: SessionStatus) => {
      await base.close(phone, status);
      const existing = [...writes].reverse().find((w) => w.phone === phone);
      if (existing !== undefined) {
        writes.push({ ...existing, status, lastActive: NOW.toISOString() });
      }
    },
  };
}

const neverCompact: CompactProvider = { compact: async () => ({ notes: [] }) };

function turnDeps(complete: ChatProvider['complete']): TurnDeps {
  return {
    chat: { complete },
    compact: neverCompact,
    count: { count: (s) => Math.ceil(s.length / 4) },
    now: () => NOW.toISOString(),
  };
}

function deps(complete: ChatProvider['complete'], store = makeStore()): TurnServiceDeps & {
  store: ReturnType<typeof makeStore>;
} {
  return { store, turn: turnDeps(complete), newId, now: () => NOW };
}

const answering = (reply: unknown = { delta: {}, reply: 'I hear you.' }) => async () => reply;

/**
 * A complete, non-ambiguous, non-red-flag case. `drooping wings` looks like a
 * plain symptom but trips the `wing_droop` red-flag rule, which is how a fixture
 * meant to exercise the resolve door ends up asserting the escalate one.
 */
const RESOLVE = {
  delta: {
    species: 'broiler',
    symptoms: ['blood in droppings'],
    onsetDays: 2,
    mortalityCount: 3,
    farmSize: 400,
    diseaseHits: ['coccidiosis'],
  },
  reply: 'Isolate the sick birds and keep the rest separate.',
};

describe('handleChat', () => {
  it('opens a session on the first message and returns its id', async () => {
    const d = deps(answering());
    const outcome = await handleChat({ farmerPhone: '+2348012345678', text: 'My chicken is sick' }, d);

    expect(outcome.sessionId).toBe(newId());
    expect(await d.store.openSession('+2348012345678')).toMatchObject({ status: 'open' });
  });

  it('keeps the same session id across messages', async () => {
    const d = deps(answering());
    const first = await handleChat({ farmerPhone: '+2348012345678', text: 'Sick bird' }, d);
    const second = await handleChat({ farmerPhone: '+2348012345678', text: 'It is limping now' }, d);

    expect(second.sessionId).toBe(first.sessionId);
  });

  it('separates farmers so one never inherits the other\'s case', async () => {
    const d = deps(answering({ delta: { species: 'broiler' }, reply: 'Noted.' }));
    await handleChat({ farmerPhone: '+2348011111111', text: 'broiler here' }, d);
    // A second farmer's turn must not start from the first farmer's answers.
    const second = deps(
      answering({ delta: {}, reply: 'Tell me more.' }),
      d.store,
    );
    await handleChat({ farmerPhone: '+2348022222222', text: 'layers here' }, second);

    expect((await d.store.openSession('+2348022222222'))?.state.case.species).toBeUndefined();
    expect((await d.store.openSession('+2348011111111'))?.state.case.species).toBe('broiler');
  });

  it('carries the case forward so the agent does not re-ask what was already answered', async () => {
    const d = deps(answering({ delta: { species: 'broiler' }, reply: 'Noted.' }));
    await handleChat({ farmerPhone: '+2348012345678', text: 'broiler' }, d);
    await handleChat({ farmerPhone: '+2348012345678', text: 'now limping' }, d);

    const stored = await d.store.openSession('+2348012345678');
    expect(stored?.state.case.species).toBe('broiler');
  });

  it('refuses a client-sent case that contradicts the stored one', async () => {
    const d = deps(answering({ delta: { species: 'broiler' }, reply: 'Noted.' }));
    await handleChat({ farmerPhone: '+2348012345678', text: 'broiler' }, d);
    await handleChat(
      {
        farmerPhone: '+2348012345678',
        text: 'actually layers',
        case: { status: 'in_progress', species: 'layer' },
      },
      d,
    );

    // A bridge can hold a snapshot read before another turn landed. Letting it
    // overwrite the recorded case would be data loss, not a merge.
    expect((await d.store.openSession('+2348012345678'))?.state.case.species).toBe('broiler');
  });

  it('accepts a client-sent case on the first turn, when there is nothing stored', async () => {
    const d = deps(answering({ delta: {}, reply: 'ok' }));
    await handleChat(
      {
        farmerPhone: '+2348012345678',
        text: 'starting over',
        case: { status: 'in_progress', species: 'layer' },
      },
      d,
    );
    expect((await d.store.openSession('+2348012345678'))?.state.case.species).toBe('layer');
  });

  it('keeps the session open after resolve door so the farmer can ask follow-ups', async () => {
    const d = deps(answering(RESOLVE));
    const outcome = await handleChat({ farmerPhone: '+2348012345678', text: 'very sick' }, d);

    expect(outcome.result.door).toBe('resolve');
    expect(d.store.lastWritten()?.status).toBe('open');
  });

  it('closes the session when the farmer expresses relief', async () => {
    const relieved = {
      ...RESOLVE,
      delta: { ...RESOLVE.delta, farmerRelieved: true },
    };
    const d = deps(answering(relieved));
    const outcome = await handleChat({ farmerPhone: '+2348012345678', text: 'thank you doctor' }, d);

    expect(outcome.result.door).toBe('resolve');
    expect(d.store.lastWritten()?.status).toBe('completed');
  });

  it('voids the session on escalation rather than completing it', async () => {
    const bleeding = {
      delta: {
        species: 'broiler',
        symptoms: ['bleeding', 'drooping wings'],
        onsetDays: 1,
        mortalityCount: 2,
        farmSize: 300,
        diseaseHits: ['newcastle'],
      },
      reply: 'Take the bird to a vet now.',
    };
    const d = deps(answering(bleeding));
    const outcome = await handleChat({ farmerPhone: '+2348012345678', text: 'bird is bleeding' }, d);

    expect(outcome.result.door).toBe('escalate');
    expect(d.store.lastWritten()?.status).toBe('void');
  });

  it('reports a coded reply as a fallback rather than pretending the model answered', async () => {
    const d = deps(answering({ delta: { species: 'a dinosaur' }, reply: 'ok' }));
    const outcome = await handleChat({ farmerPhone: '+2348012345678', text: 'hello' }, d);

    expect(outcome.fellBack).toBe(true);
    expect(outcome.result.changed).toEqual([]);
  });

  it('does not flag a normal turn as a fallback', async () => {
    const d = deps(answering({ delta: { species: 'broiler' }, reply: 'Noted.' }));
    const outcome = await handleChat({ farmerPhone: '+2348012345678', text: 'broiler' }, d);

    expect(outcome.fellBack).toBe(false);
  });

  it('rejects a missing farmerPhone with 400', async () => {
    await expect(handleChat({ text: 'hi' }, deps(answering()))).rejects.toMatchObject({
      status: 400,
      code: 'invalid_request',
    });
  });

  it('rejects a phone number it cannot normalize, rather than guessing', async () => {
    await expect(
      handleChat({ farmerPhone: '123', text: 'hi' }, deps(answering())),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an unknown field instead of ignoring it', async () => {
    await expect(
      handleChat({ farmerPhone: '+2348012345678', text: 'hi', bypassSafety: true }, deps(answering())),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects empty text', async () => {
    await expect(
      handleChat({ farmerPhone: '+2348012345678', text: '' }, deps(answering())),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('surfaces a model outage as 502, not 500, so the caller knows to retry', async () => {
    const d = deps(async () => {
      throw new LlmError('transport', 'gemini unreachable');
    });
    await expect(
      handleChat({ farmerPhone: '+2348012345678', text: 'hi' }, d),
    ).rejects.toMatchObject({ status: 502, code: 'model_unavailable' });
  });

  it('does not advance the session when the model never answered', async () => {
    const d = deps(async () => {
      throw new LlmError('transport', 'gemini unreachable');
    });
    await handleChat({ farmerPhone: '+2348012345678', text: 'hi' }, d).catch(() => undefined);

    // The request was lost, so nothing is recorded: a retry has to be able to
    // take the same turn cleanly rather than resuming from a half-written case.
    expect(await d.store.openSession('+2348012345678')).toBeUndefined();
  });

  it('names the offending field in the validation error', async () => {
    await handleChat({ farmerPhone: '+2348012345678' }, deps(answering())).catch((cause: unknown) => {
      expect(cause).toBeInstanceOf(RequestError);
      expect((cause as RequestError).message).toContain('text');
    });
  });

  it('replays the history it was given to the model', async () => {
    const seen: string[] = [];
    const d = deps(async (input) => {
      seen.push(input.query);
      return { delta: {}, reply: 'ok' };
    });
    await handleChat(
      {
        farmerPhone: '+2348012345678',
        text: 'it is worse',
        history: [
          { role: 'farmer', text: 'sick bird' },
          { role: 'agent', text: 'How many birds?' },
        ],
      },
      d,
    );
    expect(seen).toEqual(['it is worse']);
  });

  it('mints a case id, because reports and the dashboard hang off it', async () => {
    const d = deps(answering(RESOLVE));
    const outcome = await handleChat({ farmerPhone: '+2348012345678', text: 'very sick' }, d);

    // Asserted on the recorded write: the session is closed, so `openSession`
    // correctly refuses to hand it back.
    const written = d.store.lastWritten();
    expect(written?.caseId).toBe(newId());
    expect(written?.state.case.id).toBe(newId());
    expect(outcome.result.state.case.id).toBe(newId());
  });

  it('keeps the same case id across the turns of one session', async () => {
    const d = deps(answering({ delta: { species: 'broiler' }, reply: 'Noted.' }));
    const first = await handleChat({ farmerPhone: '+2348012345678', text: 'broiler' }, d);
    const second = await handleChat({ farmerPhone: '+2348012345678', text: 'now blood in droppings' }, d);

    expect(second.result.state.case.id).toBe(first.result.state.case.id);
  });

  it('does not re-mint a case id the caller already supplied', async () => {
    const supplied = '11111111-1111-4111-8111-111111111111';
    const d = deps(answering({ delta: {}, reply: 'ok' }));
    const outcome = await handleChat(
      {
        farmerPhone: '+2348012345678',
        text: 'hello',
        case: { status: 'in_progress', id: supplied },
      },
      d,
    );

    expect(outcome.result.state.case.id).toBe(supplied);
  });
});
