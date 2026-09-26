import { CompactionResultSchema, MAX_NOTES } from './llm.js';
import type { CompactProvider, TokenCounter, TurnMessage } from './providers.js';

export const DEFAULT_BUDGET_TOKENS = 1800;
export const MAX_HISTORY_MESSAGES = 40;
export const MIN_HISTORY_MESSAGES = 4;
export const MAX_NOTES_TOKENS = 500;
export const MAX_MESSAGE_CHARS = 4000;

export interface CompactHistoryResult {
  history: readonly TurnMessage[];
  notes: string[];
  compacted: boolean;
}

export interface CompactHistoryInput {
  history: readonly TurnMessage[];
  notes: string[];
  budgetTokens?: number;
}

export interface CompactHistoryDeps {
  compact: CompactProvider;
  count: TokenCounter;
}

function tokensOf(counter: TokenCounter, messages: readonly TurnMessage[], notes: string[]): number {
  let total = notes.reduce((acc, n) => acc + counter.count(n), 0);
  for (const m of messages) total += counter.count(m.role) + counter.count(m.text);
  return total;
}

// Notes are the one structure that can grow forever on its own; bound both count
// and tokens from the oldest entry so the budget stays a guarantee, not a wish.
function capNotes(counter: TokenCounter, notes: string[]): string[] {
  let capped = notes.slice(0, MAX_NOTES);
  let total = capped.reduce((acc, n) => acc + counter.count(n), 0);
  while (total > MAX_NOTES_TOKENS && capped.length > 0) {
    total -= counter.count(capped[0] ?? '');
    capped = capped.slice(1);
  }
  return capped;
}

// Fail-closed enforcement: never let a turn ship a context over budget. A freshly
// folded note is denser than the raw messages it replaced, so the window shrinks
// below its soft floor (down to one message) to make room first; oldest notes go
// only when the window is already minimal. Terminal lever: single-message text.
function enforceBudget(
  counter: TokenCounter,
  window: readonly TurnMessage[],
  notes: string[],
  budget: number,
): { window: TurnMessage[]; notes: string[] } {
  let w = window.slice();
  let n = notes.slice();

  while (tokensOf(counter, w, n) > budget && w.length > 1) w = w.slice(1);
  while (tokensOf(counter, w, n) > budget && n.length > 0) n = n.slice(1);
  w = w.map((m) => {
    if (counter.count(m.text) <= MAX_MESSAGE_CHARS) return m;
    return { ...m, text: m.text.slice(0, MAX_MESSAGE_CHARS) };
  });

  return { window: w, notes: n };
}

export async function compactHistory(
  input: CompactHistoryInput,
  deps: CompactHistoryDeps,
): Promise<CompactHistoryResult> {
  const budget = input.budgetTokens ?? DEFAULT_BUDGET_TOKENS;
  const all = input.history;
  const notes = capNotes(deps.count, input.notes);

  const overBudget = tokensOf(deps.count, all, notes) > budget;
  const overWindow = all.length > MAX_HISTORY_MESSAGES;
  if (!overBudget && !overWindow) {
    return { history: all, notes, compacted: false };
  }

  let keepCount = Math.min(all.length, MAX_HISTORY_MESSAGES);
  while (keepCount > MIN_HISTORY_MESSAGES && tokensOf(deps.count, all.slice(all.length - keepCount), notes) > budget) {
    keepCount -= 1;
  }

  const dropped = all.slice(0, all.length - keepCount);
  let nextNotes = notes;
  let folded = false;
  if (dropped.length > 0) {
    const raw = await deps.compact.compact({ notes, dropped, maxNotes: MAX_NOTES });
    const parsed = CompactionResultSchema.safeParse(raw);
    if (parsed.success) {
      nextNotes = capNotes(deps.count, parsed.data.notes);
      folded = true;
    }
  }

  const enforced = enforceBudget(deps.count, all.slice(all.length - keepCount), nextNotes, budget);
  return { history: enforced.window, notes: enforced.notes, compacted: folded };
}