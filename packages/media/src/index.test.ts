import { describe, expect, it } from 'vitest';
import { isReliable, type TranscribeResult } from './index.js';

const low: TranscribeResult = { text: 'wetin dey happen?', confidence: 0.4 };
const high: TranscribeResult = { text: 'birds dey die', confidence: 0.88 };

describe('isReliable', () => {
  it('flags low-confidence transcripts as unreliable', () => {
    expect(isReliable(low)).toBe(false);
  });

  it('accepts high-confidence transcripts', () => {
    expect(isReliable(high)).toBe(true);
  });
});