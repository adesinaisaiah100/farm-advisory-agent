import { describe, expect, it } from 'vitest';
import { measureCompactRecall } from './compact-recall.js';
import type { CompactProvider, TokenCounter, TurnMessage } from './providers.js';

function line(text: string): TurnMessage {
  return { role: 'farmer', text };
}

const countTokens: TokenCounter = { count: (s) => s.length };

const transcript = Array.from({ length: 8 }, (_, i) =>
  line(`barn-${i} di birds dey sick for dis farm ${'x'.repeat(25)}`),
);

const facts = Array.from({ length: 8 }, (_, i) => ({
  id: `barn-${i}`,
  matches: (text: string) => text.includes(`barn-${i}`),
}));

const preserve: CompactProvider = {
  compact: async (input) => ({
    notes: [...input.notes, input.dropped.map((m) => m.text.split(' ')[0]).join(' ')],
  }),
};

const lossy: CompactProvider = {
  compact: async () => ({ notes: [] }),
};

function deps(compact: CompactProvider) {
  return { compact, count: countTokens };
}

const RUN = { budgetTokens: 320, turns: 2 };

describe('measureCompactRecall', () => {
  it('reports full recall when the fold preserves facts', async () => {
    const report = await measureCompactRecall(transcript, facts, deps(preserve), RUN);
    expect(report.total).toBe(8);
    expect(report.recalled).toBe(8);
    expect(report.facts.every((f) => f.recalled)).toBe(true);
  });

  it('scores dropped facts as lost when the fold discards them', async () => {
    const report = await measureCompactRecall(transcript, facts, deps(lossy), RUN);
    expect(report.recalled).toBeLessThan(8);
    expect(report.facts.some((f) => !f.recalled)).toBe(true);
  });

  it('is deterministic for the same fold and transcript', async () => {
    const run = () => measureCompactRecall(transcript, facts, deps(preserve), RUN);
    const a = await run();
    const b = await run();
    expect(a).toEqual(b);
  });
});