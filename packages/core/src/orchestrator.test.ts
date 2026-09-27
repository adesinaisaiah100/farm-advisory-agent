import { describe, expect, it } from 'vitest';
import type { CaseData, Session } from '@poultry/schemas';
import { DoorSchema } from '@poultry/schemas';
import { FALLBACK_REPLY, FALLBACK_REPLY_EN, runTurn, type TurnDeps } from './orchestrator.js';
import type {
  ChatProvider,
  ChatInput,
  CompactProvider,
  TokenCounter,
  TurnMessage,
} from './providers.js';
import { ESCALATE_SCRIPT, ESCALATE_SCRIPT_EN } from './slip.js';
import type { ClinicalLadder, ClinicalLadderSource } from './askfor.js';

function caseData(overrides: Partial<CaseData> = {}): CaseData {
  return { status: 'in_progress', ...overrides };
}

const SUPPORTED_LADDER: ClinicalLadder = {
  disease: 'coccidiosis',
  productClass: 'an anticoccidial — amprolium or diclazuril, not an antibiotic',
  why: 'blood-stained droppings in young birds fit coccidiosis',
  askTheSeller: ['which one is it, and how much per 100 birds at this weight?'],
  needsVet: false,
  evidence: {
    agreement: 0.8,
    citations: [
      { source: 'MSD Veterinary Manual', locator: 'Coccidiosis, poultry' },
      { source: 'Nigerian Journal of Animal Science', locator: '2023 trial' },
    ],
  },
};

function supplyDelta(): Record<string, unknown> {
  return {
    delta: {
      species: 'broiler',
      symptoms: ['blood in droppings'],
      onsetDays: 1,
      mortalityCount: 1,
      farmSize: 300,
      diseaseHits: ['coccidiosis'],
      wantsSupply: true,
    },
    reply: 'Take amprolium.',
  };
}

function fakeLadder(ladder: ClinicalLadder | undefined): ClinicalLadderSource {
  return { retrieve: async () => ladder };
}

const countTokens: TokenCounter = { count: (s) => Math.ceil(s.length / 4) };

function makeDeps(raw: unknown = {}): TurnDeps {
  const chat: ChatProvider = {
    complete: async () => raw,
  };
  return makeDepsNowSyncing(chat);
}

function makeDepsNowSyncing(
  chat: ChatProvider,
  compact: CompactProvider | undefined = undefined,
): TurnDeps {
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
      delta: {
        species: 'broiler',
        symptoms: ['diarrhoea'],
        onsetDays: 1,
        mortalityCount: 1,
        farmSize: 300,
        wantsSupply: true,
      },
      reply: 'I get the exact vitamins for you.',
    });
    const result = await runTurn({ case: caseData(), query: 'I wan buy vitamins' }, deps);
    expect(result.door).toBe('supply');
    expect(result.reply).toContain('CONTACT THIS AGRO-VET STORE');
    expect(result.reply).toContain('- Symptoms: diarrhoea');
  });

  it('names no product on the supply door when no medicine index is wired', async () => {
    const deps = makeDeps(supplyDelta());
    const result = await runTurn({ case: caseData(), query: 'I wan buy medicine' }, deps);
    expect(result.door).toBe('supply');
    expect(result.reply).not.toContain('amprolium');
    expect(result.reply).toContain('I will not name a drug without a confirmed diagnosis');
    expect(result.reply).toContain('no verified medicine information');
  });

  it('includes the retrieved product class when the ladder clears the gate', async () => {
    const deps: TurnDeps = { ...makeDeps(supplyDelta()), ladder: fakeLadder(SUPPORTED_LADDER) };
    const result = await runTurn({ case: caseData(), query: 'I wan buy medicine' }, deps);
    expect(result.reply).toContain('amprolium or diclazuril');
    expect(result.reply).not.toContain('MSD Veterinary Manual');
  });

  it('still refuses a retrieved ladder the evidence does not support', async () => {
    const weak: ClinicalLadder = {
      ...SUPPORTED_LADDER,
      evidence: { agreement: 0.2, citations: SUPPORTED_LADDER.evidence.citations },
    };
    const deps: TurnDeps = { ...makeDeps(supplyDelta()), ladder: fakeLadder(weak) };
    const result = await runTurn({ case: caseData(), query: 'I wan buy medicine' }, deps);
    expect(result.reply).not.toContain('amprolium');
    expect(result.reply).toContain('the sources do not agree on the treatment');
  });

  it('never consults the medicine index on a door that is not the supply door', async () => {
    let calls = 0;
    const deps: TurnDeps = {
      ...makeDeps({ delta: { symptoms: ['sudden death'], species: 'broiler' }, reply: 'Try zinc o.' }),
      ladder: {
        retrieve: async () => {
          calls += 1;
          return SUPPORTED_LADDER;
        },
      },
    };
    await runTurn({ case: caseData(), query: 'birds dey die sudden' }, deps);
    expect(calls).toBe(0);
  });

  it('asks a discriminating question instead of resolving an ambiguous case', async () => {
    const deps = makeDeps({
      delta: {
        species: 'broiler',
        symptoms: ['sneezing', 'watery eyes'],
        onsetDays: 2,
        mortalityCount: 2,
        farmSize: 400,
        diseaseHits: ['newcastle', 'infectious_bronchitis'],
      },
      reply: 'Give am amoxicillin for 5 days.',
    });
    const result = await runTurn({ case: caseData(), query: 'my birds dey sneeze' }, deps);
    expect(result.door).toBe('triage');
    expect(result.reply).toContain('not 100% sure');
    expect(result.reply).toContain('post-mortem');
    expect(result.reply).not.toContain('amoxicillin');
    expect(result.state.case.triageTurns).toBe(1);
  });

  it('routes through a transitional door without recording it as the case outcome', async () => {
    const deps = makeDeps({
      delta: {
        species: 'broiler',
        symptoms: ['sneezing', 'watery eyes'],
        onsetDays: 2,
        mortalityCount: 2,
        farmSize: 400,
        diseaseHits: ['newcastle', 'infectious_bronchitis'],
      },
      reply: 'Give am amoxicillin.',
    });
    const result = await runTurn({ case: caseData(), query: 'my birds dey sneeze' }, deps);
    expect(result.door).toBe('triage');
    expect(result.state.case.door).toBeUndefined();
    expect(DoorSchema.safeParse(result.door).success).toBe(false);
  });

  it('discards the model reply on the triage door, where it is least trustworthy', async () => {
    const deps = makeDeps({
      delta: {
        species: 'broiler',
        symptoms: ['diarrhoea'],
        onsetDays: 2,
        mortalityCount: 2,
        farmSize: 400,
        needsConfirmation: ['diseaseHits'],
      },
      reply: 'Just buy erythromycin.',
    });
    const result = await runTurn({ case: caseData(), query: 'diarrhoea dey plenty' }, deps);
    expect(result.door).toBe('triage');
    expect(result.reply).not.toContain('erythromycin');
  });

  it('falls back when the LLM reply is not zod-valid', async () => {
    const deps = makeDeps({ delta: { symptoms: ['x'] }, reply: 42 });
    const result = await runTurn({ case: caseData(), query: 'hi' }, deps);
    expect(result.door).toBe('collect');
    expect(result.reply).toBe(FALLBACK_REPLY_EN);
    expect(result.changed).toEqual([]);
    expect(result.state.case).toEqual(caseData());
    expect(result.state.stallCount).toBe(1);
    expect(result.replyLanguage).toBe('english');
  });

  it('degrades to a code-driven collect reply after MAX_STALL consecutive invalid replies', async () => {
    const invalid = makeDeps({ reply: 42 });
    const first = await runTurn({ case: caseData(), query: 'abeg o' }, invalid);
    expect(first.reply).toBe(FALLBACK_REPLY);
    expect(first.state.stallCount).toBe(1);

    const second = await runTurn({ case: caseData(), query: 'abeg o', stallCount: 1 }, invalid);
    expect(second.reply).toContain('wetin dey happen');
    expect(second.reply).not.toBe(FALLBACK_REPLY);
    expect(second.state.stallCount).toBe(2);
    expect(second.door).toBe('collect');
  });

  it('keeps stalling in code until an LLM reply is valid again', async () => {
    const invalid = makeDeps({ reply: {} });
    const third = await runTurn({ case: caseData(), query: 'abeg o', stallCount: 2 }, invalid);
    expect(third.reply).toContain('wetin dey happen');
    expect(third.state.stallCount).toBe(3);
  });

  it('resets the stall counter on a valid reply', async () => {
    const deps = makeDeps({ delta: { symptoms: ['coughing'] }, reply: 'Noted.' });
    const result = await runTurn(
      { case: caseData(), query: 'my birds dey cough', stallCount: 5 },
      deps,
    );
    expect(result.state.stallCount).toBe(0);
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
    const result = await runTurn(
      {
        case: caseData(),
        query: 'Na me be Adaeze, abeg help',
        history,
        farmerContext: 'Adaeze · Jos North · 800 birds · reply in pidgin',
      },
      deps,
    );
    expect(result.profile).toEqual({ name: 'Adaeze' });
    expect(result.replyLanguage).toBe('pidgin');
    expect(sawInput!.history).toEqual(history);
    expect(sawInput!.farmerContext).toBe('Adaeze · Jos North · 800 birds · reply in pidgin');
  });

  it('compacts long history into notes before the chat turn', async () => {
    const longText =
      'we dey talk about di birds for this farm and e don long well well so make we continue. '.repeat(
        4,
      );
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
        await runTurn(
          { case: caseData(), query: 'layers dey die' },
          makeDeps({ delta: { species: 'layer' }, reply: 'Hear you.' }),
        )
      ).state,
      startedAt: '2026-09-25T12:00:00.000Z',
      lastActive: '2026-09-25T12:00:00.000Z',
    };
    expect(session.state.case.status).toBe('in_progress');
    expect(Array.isArray(session.state.missing)).toBe(true);
    expect(typeof session.state.updatedAt).toBe('string');
  });
});
