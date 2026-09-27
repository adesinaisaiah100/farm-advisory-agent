import { describe, expect, it } from 'vitest';
import { applyDiversityCap, independentSources, isStarved } from './select.js';
import { makeChunk } from './fixtures.js';
import type { ScoredChunk } from './store.js';

function row(id: string, groupId: string, source: string, distance: number): ScoredChunk {
  return {
    chunk: makeChunk({ id, groupId, source, locator: `${source} ${id}` }),
    distance,
  };
}

describe('isStarved', () => {
  it('is starved below the floor', () => {
    expect(isStarved(1, 2)).toBe(true);
    expect(isStarved(0, 2)).toBe(true);
  });

  it('is not starved at the floor', () => {
    expect(isStarved(2, 2)).toBe(false);
  });
});

describe('applyDiversityCap', () => {
  it('keeps at most the allowed chunks from one section', () => {
    const rows = [row('a1', 'g0', 'A', 0.1), row('a2', 'g0', 'A', 0.2), row('a3', 'g0', 'A', 0.3)];

    expect(applyDiversityCap(rows, 8, 2).map((r) => r.chunk.id)).toEqual(['a1', 'a2']);
  });

  it('fills past a capped section with the next best section', () => {
    const rows = [row('a1', 'g0', 'A', 0.1), row('a2', 'g0', 'A', 0.2), row('b1', 'g1', 'B', 0.3)];

    expect(applyDiversityCap(rows, 8, 2).map((r) => r.chunk.id)).toEqual(['a1', 'a2', 'b1']);
  });

  it('stops at topK even when more rows are available', () => {
    const rows = [row('a1', 'g0', 'A', 0.1), row('b1', 'g1', 'B', 0.2), row('c1', 'g2', 'C', 0.3)];

    expect(applyDiversityCap(rows, 2, 2)).toHaveLength(2);
  });

  it('rejects a cap that would keep nothing', () => {
    expect(() => applyDiversityCap([row('a1', 'g0', 'A', 0.1)], 8, 0)).toThrow(/maxPerGroup/);
  });
});

describe('independentSources', () => {
  it('lists each source once', () => {
    const rows = [row('a1', 'g0', 'A', 0.1), row('a2', 'g0', 'A', 0.2), row('b1', 'g1', 'B', 0.3)];

    expect(independentSources(rows)).toEqual([
      { source: 'A', locator: 'A a1' },
      { source: 'B', locator: 'B b1' },
    ]);
  });

  it('keeps the locator of the first-ranked row for a repeated source', () => {
    const rows = [row('a1', 'g0', 'A', 0.1), row('a2', 'g0', 'A', 0.2)];

    expect(independentSources(rows)[0]?.locator).toBe('A a1');
  });
});
