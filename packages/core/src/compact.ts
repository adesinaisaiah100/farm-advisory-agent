import { CompactionResultSchema } from './llm.js';
import type { CompactProvider, TokenCounter, TurnMessage } from './providers.js';

export const DEFAULT_BUDGET_TOKENS = 1800;
export const MAX_HISTORY_MESSAGES = 40;
export const MIN_HISTORY_MESSAGES = 4;

export interface CompactHistoryResult {
  history: readonly TurnMessage[];
  notes: string[];
  compacted: boolean;
}

function tokensOf(counter: TokenCounter, messages: readonly TurnMessage[], current: string[]): number {
  let total = current.reduce((acc, n) => acc + counter.count(n), 0);
  for (const m of messages) total += counter.count(m.role) + counter.count(m.text);
  return total;
}

export async function compactHistory(
  input: {
    history: readonly TurnMessage[];
    notes: string[];
    budgetTokens?: number;
  },
  deps: { compact: CompactProvider; count: TokenCounter },
): Promise<CompactHistoryResult> {
  const budget = input.budgetTokens ?? DEFAULT_BUDGET_TOKENS;
  const all = input.history;

  const overBudget = tokensOf(deps.count, all, input.notes) > budget;
  const overWindow = all.length > MAX_HISTORY_MESSAGES;
  if (!overBudget && !overWindow) {
    return { history: all, notes: input.notes, compacted: false };
  }

  let keepCount = Math.min(all.length, MAX_HISTORY_MESSAGES);
  while (keepCount > MIN_HISTORY_MESSAGES && tokensOf(deps.count, all.slice(all.length - keepCount), input.notes) > budget) {
    keepCount -= 1;
  }

  const dropped = all.slice(0, all.length - keepCount);
  if (dropped.length === 0) {
    return { history: all, notes: input.notes, compacted: false };
  }

  const raw = await deps.compact.compact({ notes: input.notes, dropped });
  const parsed = CompactionResultSchema.safeParse(raw);
  if (!parsed.success) {
    return { history: all, notes: input.notes, compacted: false };
  }
  return { history: all.slice(all.length - keepCount), notes: parsed.data.notes, compacted: true };
}