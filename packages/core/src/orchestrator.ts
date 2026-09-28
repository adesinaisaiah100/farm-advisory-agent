import type { CaseData, SessionState } from '@poultry/schemas';
import { classifyLanguage, replyLanguageFor } from './language.js';
import type { ReplyLanguage } from './language.js';
import { compactHistory, DEFAULT_BUDGET_TOKENS } from './compact.js';
import { LlmReplySchema } from './llm.js';
import type { ProfileDelta } from './llm.js';
import { mergeDelta } from './merge.js';
import type { CaseField } from './merge.js';
import { missing } from './missing.js';
import type { ChatProvider, CompactProvider, TokenCounter, TurnMessage } from './providers.js';
import { buildReferralSlip, escalationScript } from './slip.js';
import type { ClinicalLadder, ClinicalLadderSource } from './askfor.js';
import { assessTriage, triageReply } from './triage.js';
import { validateCase } from './validate.js';
import type { EffectiveDoor } from './validate.js';

export const FALLBACK_REPLY =
  'Sorry, I no well understand wetin you write. Abeg try again — tell me wetin dey happen to di birds, how many e reach, and how many don die.';

export const FALLBACK_REPLY_EN =
  "Sorry, I didn't fully understand what you wrote. Please try again — tell me what's happening with the birds, how long it's been, and how many have died.";

export const MAX_STALL = 2;

export interface TurnResult {
  state: SessionState;
  reply: string;
  door: EffectiveDoor;
  changed: CaseField[];
  replyLanguage: ReplyLanguage;
  profile: ProfileDelta | undefined;
  /**
   * True when the model's answer could not be parsed and the reply was written
   * in code instead. Set here rather than inferred by a caller, because this is
   * the only place that knows, and a silent coded fallback is exactly how a
   * broken model looks like a working product.
   */
  fellBack: boolean;
}

export interface TurnDeps {
  chat: ChatProvider;
  compact: CompactProvider;
  count: TokenCounter;
  now: () => string;
  ladder?: ClinicalLadderSource;
}

export interface TurnInput {
  case: CaseData;
  notes?: string[];
  stallCount?: number;
  farmerContext?: string;
  query: string;
  history?: readonly TurnMessage[];
}

export async function runTurn(input: TurnInput, deps: TurnDeps): Promise<TurnResult> {
  const filled = input.case;
  const missingFields = missing(filled);
  const replyLanguage = replyLanguageFor(classifyLanguage(input.query));
  const history = input.history ?? [];

  const compacted = await compactHistory(
    { history, notes: input.notes ?? [], budgetTokens: DEFAULT_BUDGET_TOKENS },
    { compact: deps.compact, count: deps.count },
  );
  const notes = compacted.notes;
  const windowed = compacted.history;

  const raw = await deps.chat.complete({
    filled,
    missing: missingFields,
    notes,
    farmerContext: input.farmerContext,
    query: input.query,
    history: windowed,
    replyLanguage,
  });

  const parsed = LlmReplySchema.safeParse(raw);
  if (!parsed.success) {
    const stallCount = (input.stallCount ?? 0) + 1;
    return {
      state: { case: filled, missing: missingFields, notes, stallCount, updatedAt: deps.now() },
      reply:
        stallCount >= MAX_STALL ? stallReply(filled, replyLanguage) : fallbackReply(replyLanguage),
      door: 'collect',
      changed: [],
      replyLanguage,
      profile: undefined,
      fellBack: true,
    };
  }

  const nextCase = mergeDelta(filled, parsed.data.delta);
  const decision = validateCase(nextCase, parsed.data.delta.wantsSupply ?? false);
  nextCase.status = decision.caseStatus;
  nextCase.editedAt = deps.now();
  if (decision.door === 'triage') {
    nextCase.triageTurns = (filled.triageTurns ?? 0) + 1;
  }

  const ladder = await retrieveLadder(decision.door, nextCase, deps.ladder);

  const reply = replyFor(decision.door, parsed.data.reply, nextCase, replyLanguage, ladder);

  return {
    state: {
      case: nextCase,
      missing: missing(nextCase),
      notes,
      stallCount: 0,
      updatedAt: deps.now(),
    },
    reply,
    door: decision.door,
    changed: changedFields(filled, nextCase),
    replyLanguage,
    profile: parsed.data.profile,
    fellBack: false,
  };
}

const COLLECT_PROMPT: Record<ReplyLanguage, Record<string, string>> = {
  pidgin: {
    species: 'which bird (broiler, layer, cockerel)?',
    symptoms: 'wetin dey happen to di birds?',
    onsetDays: 'how long dis one don dey happen?',
    mortalityCount: 'how many birds don die?',
  },
  english: {
    species: 'which bird (broiler, layer, or cockerel)?',
    symptoms: 'what signs are you seeing?',
    onsetDays: 'how long has this been going on?',
    mortalityCount: 'how many birds have died?',
  },
};

const COLLECT_INTRO: Record<ReplyLanguage, string> = {
  pidgin: 'So we fit help you better, abeg tell us:',
  english: 'So we can help you better, please tell us:',
};

function fallbackReply(lang: ReplyLanguage): string {
  return lang === 'english' ? FALLBACK_REPLY_EN : FALLBACK_REPLY;
}

// After repeated invalid LLM replies, answer with the questions we already know in
// code instead of paying for another model call that will fail the same way.
function stallReply(c: CaseData, lang: ReplyLanguage): string {
  const asks = missing(c)
    .map((f) => COLLECT_PROMPT[lang][f] ?? f)
    .filter(Boolean);
  if (asks.length === 0) return fallbackReply(lang);
  return `${COLLECT_INTRO[lang]} ${asks.join(' ')}`;
}

// Retrieval only ever runs on the supply door, and only after triage has cleared the case.
// Without a source the slip still renders, naming no product, so a missing index fails closed
// instead of silently falling back to hardcoded medicine copy.
async function retrieveLadder(
  door: EffectiveDoor,
  c: CaseData,
  source: ClinicalLadderSource | undefined,
): Promise<ClinicalLadder | undefined> {
  if (door !== 'supply' || source === undefined) return undefined;
  return source.retrieve(c);
}

function replyFor(
  door: EffectiveDoor,
  llmReply: string,
  c: CaseData,
  lang: ReplyLanguage,
  ladder: ClinicalLadder | undefined,
): string {
  switch (door) {
    case 'escalate':
      return escalationScript(lang);
    case 'supply':
      return buildReferralSlip(c, undefined, ladder);
    case 'resolve':
    case 'report':
      return llmReply;
    case 'triage':
      // The model's own text is discarded on this door: it is the turn where the model
      // is least sure, and a confident-sounding reply is exactly what must not reach a farmer.
      return triageReply(assessTriage(c), lang);
    case 'collect': {
      const asks = missing(c)
        .map((f) => COLLECT_PROMPT[lang][f] ?? f)
        .filter(Boolean);
      return `${llmReply}\n\n${COLLECT_INTRO[lang]} ${asks.join(' ')}`;
    }
  }
}

function changedFields(before: CaseData, after: CaseData): CaseField[] {
  const keys = new Set<CaseField>([...Object.keys(before), ...Object.keys(after)] as CaseField[]);
  const changed: CaseField[] = [];
  for (const key of keys) {
    if ((before as Record<string, unknown>)[key] !== (after as Record<string, unknown>)[key])
      changed.push(key);
  }
  return changed;
}
