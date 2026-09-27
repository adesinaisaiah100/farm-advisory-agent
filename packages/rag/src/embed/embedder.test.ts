import { describe, expect, it } from 'vitest';
import { EmbedError, assertDims, l2Norm, l2Normalize } from './embedder.js';

describe('l2Norm', () => {
  it('measures the length of a known vector', () => {
    expect(l2Norm([3, 4])).toBe(5);
  });

  it('reports zero for a zero vector', () => {
    expect(l2Norm([0, 0, 0])).toBe(0);
  });
});

describe('l2Normalize', () => {
  it('produces a unit vector', () => {
    expect(l2Norm(l2Normalize([3, 4]))).toBeCloseTo(1, 10);
  });

  it('keeps the direction of the input', () => {
    expect(l2Normalize([0, 5, 0])).toEqual([0, 1, 0]);
  });

  it('leaves an already-normalized vector unchanged', () => {
    expect(l2Normalize([0, 1])).toEqual([0, 1]);
  });

  it('rejects an empty vector', () => {
    expect(() => l2Normalize([])).toThrow(EmbedError);
  });

  it('rejects a zero vector because it has no direction', () => {
    expect(() => l2Normalize([0, 0, 0])).toThrow(EmbedError);
  });

  it('rejects a vector carrying NaN', () => {
    expect(() => l2Normalize([Number.NaN, 1])).toThrow(EmbedError);
  });
});

describe('assertDims', () => {
  it('passes when the width matches', () => {
    expect(() => assertDims([1, 2, 3], 3, 'vector')).not.toThrow();
  });

  it('names the label and both widths when it does not', () => {
    expect(() => assertDims([1, 2], 3, 'embedding 7')).toThrow(/embedding 7 has 2 dims, expected 3/);
  });
});
