import { describe, expect, it, vi } from 'vitest';
import { compactHistory } from './compact.js';
import type { CompactProvider, TokenCounter, TurnMessage } from './providers.js';
import type { TurnDeps } from './orchestrator.js';

function msg(i: number): TurnMessage {
  return { role: i % 2 === 0 ? 'farmer' : 'agent', text: `msg ${i}` };
}

function history(n: number): readonly TurnMessage[] {
  return Array.from({ length: n }, (_, i) => msg(i));
}

const countTokens: TokenCounter = { count: (s) => s.length };

const never: CompactProvider = {
  compact: async () => ({ notes: [] }),
};

function deps(compact: CompactProvider): Pick<TurnDeps, 'compact' | 'count'> {
  return {
    compact,
    count: countTokens,
  };
}

describe('compactHistory', () => {
  it('does not compact when under budget', async () => {
    const compact = vi.fn(never.compact);
    const result = await compactHistory(
      { history: history(2), notes: [], budgetTokens: 1000 },
      deps({ compact }),
    );
    expect(result.compacted).toBe(false);
    expect(result.history).toEqual(history(2));
    expect(compact).not.toHaveBeenCalled();
  });

  it('compacts when over budget, folding old messages into notes', async () => {
    const compact: CompactProvider = {
      compact: async (input) => {
        expect(input.dropped.length).toBeGreaterThan(0);
        return { notes: [...input.notes, `folded ${input.dropped.length}`] };
      },
    };
    const result = await compactHistory(
      { history: history(60), notes: [], budgetTokens: 100 },
      deps(compact),
    );
    expect(result.compacted).toBe(true);
    expect(result.history.length).toBeLessThan(60);
    expect(result.notes[0]).toMatch(/^folded \d+$/);
  });

  it('caps history to a maximum message count even when under budget', async () => {
    const compact: CompactProvider = {
      compact: async () => ({ notes: [] }),
    };
    const result = await compactHistory(
      { history: history(50), notes: [], budgetTokens: 10_000_000 },
      deps(compact),
    );
    expect(result.compacted).toBe(true);
    expect(result.history.length).toBeLessThanOrEqual(40);
  });

  it('treats existing notes as part of the context budget', async () => {
    const compact = vi.fn(never.compact);
    await compactHistory(
      { history: history(6), notes: ['x'.repeat(100)], budgetTokens: 80 },
      deps({ compact }),
    );
    expect(compact).toHaveBeenCalled();
  });

  it('does not call compact when the same search is under budget', async () => {
    const compact = vi.fn(never.compact);
    await compactHistory(
      { history: history(6), notes: [], budgetTokens: 80 },
      deps({ compact }),
    );
    expect(compact).not.toHaveBeenCalled();
  });

  it('drops the oldest messages into the compaction call', async () => {
    let dropped: readonly TurnMessage[] = [];
    const compact: CompactProvider = {
      compact: async (input) => {
        dropped = input.dropped;
        return { notes: [] };
      },
    };
    const result = await compactHistory({ history: history(50), notes: [], budgetTokens: 100 }, deps(compact));
    expect(dropped[0]?.text).toBe('msg 0');
    expect(result.history[0]?.text).not.toBe('msg 0');
  });

  it('cuts below the minimum window when the budget leaves no other choice', async () => {
    const compact: CompactProvider = {
      compact: async () => ({ notes: [] }),
    };
    const result = await compactHistory({ history: history(6), notes: [], budgetTokens: 0 }, deps(compact));
    expect(result.history.length).toBe(1);
  });

  it('ignores invalid compaction output but still enforces the budget', async () => {
    const compact: CompactProvider = {
      compact: async () => ({ notes: 'not an array' }),
    };
    const result = await compactHistory({ history: history(60), notes: [], budgetTokens: 100 }, deps(compact));
    expect(result.compacted).toBe(false);
    expect(costOf(result)).toBeLessThanOrEqual(100);
  });

  it('never ships a context over budget even when the fold lands heavy notes', async () => {
    const compact: CompactProvider = {
      compact: async () => ({ notes: Array.from({ length: 10 }, () => 'n'.repeat(50)) }),
    };
    const result = await compactHistory(
      { history: history(60), notes: ['x'.repeat(500)], budgetTokens: 100 },
      deps(compact),
    );
    expect(result.notes.length).toBeGreaterThan(0);
    expect(costOf(result)).toBeLessThanOrEqual(100);
  });

  it('caps notes to a fixed count and token budget even when idle', async () => {
    const input = Array.from({ length: 40 }, (_, i) => `note-${i}-${'y'.repeat(100)}`);
    const result = await compactHistory(
      { history: history(2), notes: input, budgetTokens: 10_000_000 },
      deps(never),
    );
    expect(result.compacted).toBe(false);
    expect(result.notes.length).toBeLessThanOrEqual(12);
    expect(result.notes.reduce((acc, n) => acc + n.length, 0)).toBeLessThanOrEqual(500);
  });

  it('truncates a single overlong message before shipping it', async () => {
    const huge = { role: 'farmer' as const, text: 'z'.repeat(10_000) };
    const result = await compactHistory({ history: [huge], notes: [], budgetTokens: 100 }, deps(never));
    expect(result.history[0]!.text.length).toBeLessThanOrEqual(4000);
  });
});

function costOf(result: { history: readonly TurnMessage[]; notes: string[] }): number {
  const roleLength = { farmer: 6, agent: 5 };
  const msgs = result.history.reduce((acc, m) => acc + roleLength[m.role] + m.text.length, 0);
  return msgs + result.notes.reduce((acc, n) => acc + n.length, 0);
}