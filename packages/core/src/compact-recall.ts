import { compactHistory } from './compact.js';
import type { CompactProvider, TokenCounter, TurnMessage } from './providers.js';

export interface RecallFact {
  id: string;
  matches: (text: string) => boolean;
}

export interface RecallRunOptions {
  budgetTokens?: number;
  turns?: number;
}

export interface RecallReport {
  facts: { id: string; recalled: boolean }[];
  total: number;
  recalled: number;
}

// Scores how many critical facts survive repeated compaction: appends a transcript
// across turns, runs compactHistory before every turn, then asks each fact whether
// the retained context (notes + window) still holds it. Unit tests use deterministic
// folds; the real LLM fold (Phase 8) is judged against the same harness.
export async function measureCompactRecall(
  transcript: readonly TurnMessage[],
  facts: readonly RecallFact[],
  deps: { compact: CompactProvider; count: TokenCounter },
  options: RecallRunOptions = {},
): Promise<RecallReport> {
  const turns = Math.max(1, options.turns ?? Math.ceil(transcript.length / 2));

  let history: readonly TurnMessage[] = [];
  let notes: string[] = [];
  for (let t = 0; t < turns; t += 1) {
    const from = Math.floor((t * transcript.length) / turns);
    const to = t === turns - 1 ? transcript.length : Math.floor(((t + 1) * transcript.length) / turns);
    history = [...history, ...transcript.slice(from, to)];
    const result = await compactHistory({ history, notes, budgetTokens: options.budgetTokens }, deps);
    history = result.history;
    notes = result.notes;
  }

  const retained = `${notes.join('\n')}\n${history.map((m) => m.text).join('\n')}`;
  const outcomes = facts.map((f) => ({ id: f.id, recalled: f.matches(retained) }));
  return {
    facts: outcomes,
    total: outcomes.length,
    recalled: outcomes.filter((o) => o.recalled).length,
  };
}