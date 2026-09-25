import { describe, expect, it } from 'vitest';
import { CaseDeltaSchema, LlmReplySchema } from './llm.js';

describe('CaseDeltaSchema', () => {
  it('accepts a partial capture', () => {
    expect(CaseDeltaSchema.safeParse({ species: 'layer', symptoms: ['drop in lay'] }).success).toBe(true);
  });

  it('rejects unknown keys', () => {
    expect(CaseDeltaSchema.safeParse({ evil: true }).success).toBe(false);
  });

  it('rejects oversized farm sizes', () => {
    expect(CaseDeltaSchema.safeParse({ farmSize: 99999 }).success).toBe(false);
  });

  it('rejects out-of-range mortality percent', () => {
    expect(CaseDeltaSchema.safeParse({ mortalityRatePct: 150 }).success).toBe(false);
  });
});

describe('LlmReplySchema', () => {
  const ok = { delta: { species: 'broiler' }, reply: 'Noted.' };

  it('accepts a well-formed reply', () => {
    expect(LlmReplySchema.safeParse(ok).success).toBe(true);
  });

  it('rejects a missing delta', () => {
    expect(LlmReplySchema.safeParse({ reply: 'x' }).success).toBe(false);
  });

  it('rejects a missing or empty reply', () => {
    expect(LlmReplySchema.safeParse({ delta: {}, reply: '' }).success).toBe(false);
  });

  it('rejects a non-string reply', () => {
    expect(LlmReplySchema.safeParse({ delta: {}, reply: 42 }).success).toBe(false);
  });

  it('rejects unknown top-level keys', () => {
    expect(LlmReplySchema.safeParse({ ...ok, hallucination: 'x' }).success).toBe(false);
  });
});