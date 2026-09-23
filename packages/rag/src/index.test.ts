import { describe, expect, it } from 'vitest';
import { overlapsChunk, type Chunk } from './index.js';

const chunk: Chunk = { id: 'c1', groupId: 'g1', position: 0, text: 'Newcastle Disease kills fast.' };

describe('overlapsChunk', () => {
  it('matches case-insensitively', () => {
    expect(overlapsChunk(chunk, 'newcastle')).toBe(true);
  });

  it('detects non-overlap', () => {
    expect(overlapsChunk(chunk, 'gumboro')).toBe(false);
  });
});