import { describe, expect, it } from 'vitest';
import { microChunk } from './micro-chunk.js';
import type { TokenCounter } from './tokens.js';

const words: TokenCounter = {
  count: (text) => (text.length === 0 ? 0 : text.trim().split(/\s+/).length),
};

const SENTENCES = [
  'One two three four five.',
  'Six seven eight nine ten.',
  'Eleven twelve thirteen fourteen.',
  'Fifteen sixteen seventeen eighteen.',
  'Nineteen twenty.',
];

function sentences(count: number): string {
  return Array.from({ length: count }, (_, index) => `Sentence ${index + 1}.`).join(' ');
}

describe('microChunk', () => {
  it('never splits a sentence', () => {
    const pieces = microChunk(SENTENCES.join(' '), {
      targetTokens: 6,
      maxTokens: 8,
      overlapTokens: 0,
      count: words,
    });
    expect(pieces.map((piece) => piece.text)).toEqual([
      'One two three four five.',
      'Six seven eight nine ten.',
      'Eleven twelve thirteen fourteen. Fifteen sixteen seventeen eighteen.',
      'Nineteen twenty.',
    ]);
  });

  it('produces no shared sentence when the overlap is zero', () => {
    const pieces = microChunk(SENTENCES.join(' '), {
      targetTokens: 6,
      maxTokens: 8,
      overlapTokens: 0,
      count: words,
    });
    for (let index = 1; index < pieces.length; index += 1) {
      expect(overlapSuffix(pieces[index - 1]?.text ?? '', pieces[index]?.text ?? '')).toBe(0);
    }
  });

  it('packs whole sentences up to the ceiling', () => {
    const pieces = microChunk(sentences(10), {
      targetTokens: 4,
      maxTokens: 6,
      overlapTokens: 0,
      count: words,
    });
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) {
      expect(piece.tokenCount).toBeLessThanOrEqual(6);
    }
  });

  it('starts the next piece with exactly the intended overlap', () => {
    const pieces = microChunk(sentences(12), {
      targetTokens: 4,
      maxTokens: 6,
      overlapTokens: 4,
      count: words,
    });
    expect(pieces.length).toBeGreaterThan(2);
    for (let index = 1; index < pieces.length; index += 1) {
      const previous = pieces[index - 1]?.text ?? '';
      const current = pieces[index]?.text ?? '';
      const overlap = overlapSuffix(previous, current);
      expect(overlap).toBeGreaterThan(0);
      expect(overlap).toBeLessThanOrEqual(4);
    }
  });

  it('accounts for every token of overlap in the tail of the previous piece', () => {
    const pieces = microChunk(sentences(12), {
      targetTokens: 4,
      maxTokens: 6,
      overlapTokens: 4,
      count: words,
    });
    const first = pieces[0];
    const second = pieces[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const overlapTokens = words.count(overlapText(first?.text ?? '', second?.text ?? ''));
    expect(overlapTokens).toBeGreaterThan(0);
    expect(overlapTokens).toBeLessThanOrEqual(4);
  });

  it('reports an unsplittable oversized sentence instead of cutting it', () => {
    const long = `${'word '.repeat(40).trim()} end.`;
    const pieces = microChunk(long, {
      targetTokens: 10,
      maxTokens: 20,
      overlapTokens: 5,
      count: words,
    });
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.oversized).toBe(true);
    expect(pieces[0]?.text).toBe(long);
  });

  it('clamps an oversized overlap to the previous chunk tail and still advances', () => {
    const pieces = microChunk(sentences(8), {
      targetTokens: 4,
      maxTokens: 6,
      overlapTokens: 100,
      count: words,
    });
    expect(pieces.map((piece) => piece.text)).toEqual([
      'Sentence 1. Sentence 2. Sentence 3.',
      'Sentence 2. Sentence 3. Sentence 4.',
      'Sentence 3. Sentence 4. Sentence 5.',
      'Sentence 4. Sentence 5. Sentence 6.',
      'Sentence 5. Sentence 6. Sentence 7.',
      'Sentence 6. Sentence 7. Sentence 8.',
    ]);
  });

  it('returns one piece when the text fits', () => {
    const pieces = microChunk('Only one short sentence.', {
      targetTokens: 50,
      maxTokens: 60,
      overlapTokens: 5,
      count: words,
    });
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.oversized).toBe(false);
  });

  it('returns nothing for empty text', () => {
    expect(
      microChunk('  ', { targetTokens: 4, maxTokens: 6, overlapTokens: 0, count: words }),
    ).toEqual([]);
  });
});

function overlapSuffix(previous: string, current: string): number {
  const previousWords = previous.split(/\s+/);
  const currentWords = current.split(/\s+/);
  let matched = 0;
  for (let size = 1; size <= previousWords.length; size += 1) {
    const tail = previousWords.slice(previousWords.length - size).join(' ');
    if (currentWords.slice(0, size).join(' ') === tail) matched = size;
  }
  return matched;
}

function overlapText(previous: string, current: string): string {
  const previousWords = previous.split(/\s+/);
  const currentWords = current.split(/\s+/);
  let matched = 0;
  for (let size = 1; size <= previousWords.length; size += 1) {
    const tail = previousWords.slice(previousWords.length - size).join(' ');
    if (currentWords.slice(0, size).join(' ') === tail) matched = size;
  }
  return previousWords.slice(previousWords.length - matched).join(' ');
}
