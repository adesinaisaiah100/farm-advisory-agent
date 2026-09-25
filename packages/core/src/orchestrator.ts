import type { CaseData, SessionState } from '@poultry/schemas';
import { LlmReplySchema } from './llm.js';
import { mergeDelta } from './merge.js';
import type { CaseField } from './merge.js';
import { missing } from './missing.js';
import type { ChatProvider } from './providers.js';
import { buildReferralSlip, ESCALATE_SCRIPT } from './slip.js';
import { validateCase } from './validate.js';
import type { EffectiveDoor } from './validate.js';

export const FALLBACK_REPLY =
  'Sorry, I no well understand wetin you write. Abeg try again — tell me wetin dey happen to di birds, how many e reach, and how many don die.';

export interface TurnResult {
  state: SessionState;
  reply: string;
  door: EffectiveDoor;
  changed: CaseField[];
}

export interface TurnDeps {
  chat: ChatProvider;
  now: () => string;
}

export async function runTurn(input: { case: CaseData; query: string }, deps: TurnDeps): Promise<TurnResult> {
  const filled = input.case;
  const missingFields = missing(filled);
  const raw = await deps.chat.complete({ filled, missing: missingFields, query: input.query });

  const parsed = LlmReplySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      state: { case: filled, missing: missingFields, updatedAt: deps.now() },
      reply: FALLBACK_REPLY,
      door: 'collect',
      changed: [],
    };
  }

  const nextCase = mergeDelta(filled, parsed.data.delta);
  const decision = validateCase(nextCase, parsed.data.delta.wantsSupply ?? false);
  nextCase.status = decision.caseStatus;
  nextCase.editedAt = deps.now();

  const reply = replyFor(decision.door, parsed.data.reply, nextCase);

  return {
    state: { case: nextCase, missing: missing(nextCase), updatedAt: deps.now() },
    reply,
    door: decision.door,
    changed: changedFields(filled, nextCase),
  };
}

const COLLECT_PROMPT: Record<string, string> = {
  species: 'which bird (broiler, layer, cockerel)?',
  symptoms: 'wetin dey happen to di birds?',
  onsetDays: 'how long dis one don dey happen?',
  mortalityCount: 'how many birds don die?',
};

function replyFor(door: EffectiveDoor, llmReply: string, c: CaseData): string {
  switch (door) {
    case 'escalate':
      return ESCALATE_SCRIPT;
    case 'supply':
      return buildReferralSlip(c, undefined);
    case 'resolve':
      return llmReply;
    case 'report':
      return llmReply;
    case 'collect': {
      const asks = missing(c).map((f) => COLLECT_PROMPT[f] ?? f).filter(Boolean);
      return `${llmReply}\n\nSo we fit help you better, abeg tell us: ${asks.join(' ')}`;
    }
  }
}

function changedFields(before: CaseData, after: CaseData): CaseField[] {
  const keys = new Set<CaseField>([...Object.keys(before), ...Object.keys(after)] as CaseField[]);
  const changed: CaseField[] = [];
  for (const key of keys) {
    if ((before as Record<string, unknown>)[key] !== (after as Record<string, unknown>)[key]) changed.push(key);
  }
  return changed;
}