import { describe, expect, it } from 'vitest';
import type { CaseData, Session } from '@poultry/schemas';
import {
  FALLBACK_REPLY_EN,
  runTurn,
  type TurnDeps,
} from './orchestrator.js';
import type { ChatProvider, ChatInput, CompactProvider, TokenCounter, TurnMessage } from './providers.js';
import { ESCALATE_SCRIPT, ESCALATE_SCRIPT_EN } from './slip.js';

function caseData(overrides: Partial<CaseData> = {}): CaseData {
  return { status: 'in_progress', ...overrides };
}

const countTokens: TokenCounter = { count: (s) => Math.ceil(s.length / 4) };

function makeDeps(raw: unknown = {}): TurnDeps {
  const chat: ChatProvider = {
    complete: async () => raw,
  };
  return makeDepsNowSyncing(chat);
}

function makeDepsNowSyncing(chat: ChatProvider, compact: CompactProvider | undefined = undefined): TurnDeps {
  let n = 0;
  const neverCompact: CompactProvider = {
    compact: async () => ({ notes: [] }),
  };
  return {
    chat,
    compact: compact ?? neverCompact,
    count: countTokens,
    now: () => `2026-09-25T12:0${n++}:00.000Z`,
  };
}

describe('runTurn', () => {
  it('applies a delta and resolves when complete', async () => {
    const deps = makeDeps({
      delta: {
        species: 'layer',
        symptoms: ['drop in egg production'],
        onsetDays: 3,
        mortalityCount: 2,
        farmSize: 800,
      },
      reply: 'Na small stress, follow this treatment.',
    });
    const result = await runTurn({ case: caseData(), query: 'My layers don decrease egg' }, deps);
    expect(result.door).toBe('resolve');
    expect(result.reply).toBeTruthy();
    expect(result.state.case).toMatchObject({
      species: 'layer',
      onsetDays: 3,
      status: 'complete',
    });
    expect(result.changed).toContain('symptoms');
  });

  it('collects more fields until complete', async () => {
    const deps = makeDeps({
      delta: { symptoms: ['coughing'], onsetDays: 2 },
      reply: 'I hear you.',
    });
    const first = await runTurn({ case: caseData(), query: 'birds dey cough' }, deps);
    expect(first.door).toBe('collect');
    expect(first.state.missing).toEqual(['species', 'mortalityCount']);

    const second = await runTurn(
      { case: first.state.case, query: 'layers, 4 don die' },
      makeDeps({ delta: { species: 'layer', mortalityCount: 4 }, reply: 'Okay, noted.' }),
    );
    expect(second.door).toBe('resolve');
    expect(second.state.missing).toEqual([]);
  });

  it('escalates and overrides the LLM reply', async () => {
    const deps = makeDeps({
      delta: { symptoms: ['sudden death'], species: 'broiler' },
      reply: 'Just try zinc o.',
    });
    const result = await runTurn({ case: caseData(), query: 'birds dey die sudden' }, deps);
    expect(result.door).toBe('escalate');
    expect(result.reply).toBe(ESCALATE_SCRIPT);
    expect(result.state.case.status).toBe('escalated');
  });

  it('builds a referral slip when the farmer wants supply', async () => {
    const deps = makeDeps({
      delta: { species: 'broiler', symptoms: ['diarrhoea'], onsetDays: 1, mortalityCount: 1, farmSize: 300, wantsSupply: true },
      reply: 'I get the exact vitamins for you.',
    });
    const result = await runTurn({ case: caseData(), query: 'I wan buy vitamins' }, deps);
    expect(result.door).toBe('supply');
    expect(result.reply).toContain('CONTACT THIS AGRO-VET STORE');
    expect(result.reply).toContain('symptoms');
  });

  it('falls back when the LLM reply is not zod-valid', async () => {
    const deps = makeDeps({ delta: { symptoms: ['x'] }, reply: 42 });
    const result = await runTurn({ case: caseData(), query: 'hi' }, deps);
    expect(result.door).toBe('collect');
    expect(result.reply).toBe(FALLBACK_REPLY_EN);
    expect(result.changed).toEqual([]);
    expect(result.state.case).toEqual(caseData());
    expect(result.replyLanguage).toBe('english');
  });

  it('rejects a delta with unknown keys', async () => {
    const deps = makeDeps({ delta: { symptoms: ['x'], evil: true }, reply: 'ok' });
    const result = await runTurn({ case: caseData(), query: 'hi' }, deps);
    expect(result.door).toBe('collect');
    expect(result.reply).toBe(FALLBACK_REPLY_EN);
  });

  it('uses the english escalation script for an english farmer', async () => {
    const deps = makeDeps({
      delta: { symptoms: ['sudden death'], species: 'broiler' },
      reply: 'ok',
    });
    const result = await runTurn({ case: caseData(), query: 'My birds are dying suddenly' }, deps);
    expect(result.door).toBe('escalate');
    expect(result.reply).toBe(ESCALATE_SCRIPT_EN);
    expect(result.replyLanguage).toBe('english');
  });

  it('captures the farmer profile name and passes history to the chat', async () => {
    const history: readonly TurnMessage[] = [
      { role: 'farmer', text: 'Boss, my name na Adaeze' },
      { role: 'agent', text: 'Hear you' },
    ];
    let sawInput: ChatInput;
    const chat: ChatProvider = {
      complete: async (input) => {
        sawInput = input;
        return { delta: { species: 'broiler' }, profile: { name: 'Adaeze' }, reply: 'Noted.' };
      },
    };
    const deps = makeDepsNowSyncing(chat);
    const result = await runTurn({ case: caseData(), query: 'Na me be Adaeze, abeg help', history }, deps);
    expect(result.profile).toEqual({ name: 'Adaeze' });
    expect(result.replyLanguage).toBe('pidgin');
    expect(sawInput!.history).toEqual(history);
  });

  it('compacts long history into notes before the chat turn', async () => {
    const longText = 'we dey talk about di birds for this farm and e don long well well so make we continue. '.repeat(4);
    const history: readonly TurnMessage[] = Array.from({ length: 45 }, (_, i) => ({
      role: i % 2 === 0 ? 'farmer' : 'agent',
      text: `${longText} ${i}`,
    }));
    let sawInput: ChatInput;
    const chat: ChatProvider = {
      complete: async (input) => {
        sawInput = input;
        return { delta: {}, reply: 'ok' };
      },
    };
    const compact: CompactProvider = {
      compact: async (input) => {
        expect(input.dropped.length).toBeGreaterThan(0);
        return { notes: ['already gave amprolium 3 days ago'] };
      },
    };
    const deps = makeDepsNowSyncing(chat, compact);
    const result = await runTurn({ case: caseData(), query: 'how far', history }, deps);
    expect(result.state.notes).toEqual(['already gave amprolium 3 days ago']);
    expect(sawInput!.notes).toEqual(['already gave amprolium 3 days ago']);
    expect(sawInput!.history.length).toBeLessThanOrEqual(40);
  });

  it('never regresses missing() once a field is filled', async () => {
    const deps = makeDeps({
      delta: {
        species: 'broiler',
        symptoms: ['diarrhoea'],
        onsetDays: 2,
        mortalityCount: 3,
        farmSize: 500,
      },
      reply: 'All noted.',
    });
    const first = await runTurn({ case: caseData(), query: 'details' }, deps);
    expect(first.state.missing).toEqual([]);

    const regress = await runTurn(
      { case: first.state.case, query: 'more info' },
      makeDeps({ delta: {}, reply: 'got it' }),
    );
    expect(regress.state.missing).toEqual([]);
  });
});

describe('runTurn session shape', () => {
  it('produces a state that satisfies the session schema contract', async () => {
    const session: Session = {
      id: '9d47f8cd-4b6f-4f1a-8a6b-9ae1aef9b701',
      phone: '+2348012345678',
      status: 'open',
      state: await (
        await runTurn({ case: caseData(), query: 'layers dey die' }, makeDeps({ delta: { species: 'layer' }, reply: 'Hear you.' }))
      ).state,
      startedAt: '2026-09-25T12:00:00.000Z',
      lastActive: '2026-09-25T12:00:00.000Z',
    };
    expect(session.state.case.status).toBe('in_progress');
    expect(Array.isArray(session.state.missing)).toBe(true);
    expect(typeof session.state.updatedAt).toBe('string');
  });
});