import type { TokenCounter } from './tokens.js';
import { splitSentences } from './sentences.js';

export interface MicroChunk {
  text: string;
  tokenCount: number;
  oversized: boolean;
}

export interface MicroChunkOptions {
  targetTokens: number;
  maxTokens: number;
  overlapTokens: number;
  count: TokenCounter;
}

export const DEFAULT_CHUNKING = {
  targetTokens: 800,
  maxTokens: 1000,
  overlapTokens: 100,
} as const;

// A single sentence longer than the ceiling stays whole and is reported as oversized rather
// than being cut mid-clause: a chunk boundary inside a clause reads as a second, weaker claim.
export function microChunk(text: string, options: MicroChunkOptions): MicroChunk[] {
  const { maxTokens, overlapTokens, count } = options;
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const pieces: MicroChunk[] = [];
  let start = 0;

  while (start < sentences.length) {
    let total = 0;
    let end = start;
    while (end < sentences.length) {
      const sentence = sentences[end];
      if (sentence === undefined) break;
      const next = total + count.count(sentence);
      if (end > start && next > maxTokens) break;
      total = next;
      end += 1;
    }

    const body = sentences.slice(start, end);
    pieces.push({
      text: body.join(' '),
      tokenCount: total,
      oversized: total > maxTokens,
    });

    if (end >= sentences.length) break;
    start = overlapStart(sentences, start, end, overlapTokens, count);
  }

  return pieces;
}

function overlapStart(
  sentences: readonly string[],
  start: number,
  end: number,
  overlapTokens: number,
  count: TokenCounter,
): number {
  if (overlapTokens <= 0) return end;

  let total = 0;
  let next = end;
  while (next > start + 1) {
    const sentence = sentences[next - 1];
    if (sentence === undefined) break;
    total += count.count(sentence);
    next -= 1;
    if (total >= overlapTokens) break;
  }
  return Math.max(next, start + 1);
}
