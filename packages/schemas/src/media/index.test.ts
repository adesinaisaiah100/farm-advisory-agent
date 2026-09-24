import { describe, expect, it } from 'vitest';
import { CONFIDENCE_THRESHOLD, isReliable, MediaSchema } from './index.js';

const ID = '9d47f8cd-4b6f-4f1a-8a6b-9ae1aef9b701';
const WHEN = '2026-09-24T10:00:00.000Z';

describe('MediaSchema', () => {
  it('accepts a stored media row', () => {
    const row = {
      id: ID,
      farmerPhone: '+2348012345678',
      mime: 'audio/mp4',
      r2Key: 'audio/2026/09/sample.m4a',
      kind: 'audio',
      uploadedAt: WHEN,
    };
    expect(MediaSchema.safeParse(row).success).toBe(true);
  });

  it('accepts a transcribed media row', () => {
    const row = {
      id: ID,
      farmerPhone: '+2348012345678',
      caseId: ID,
      mime: 'audio/mp4',
      r2Key: 'audio/2026/09/sample.m4a',
      kind: 'audio',
      transcript: 'my chicken dey die',
      transcriptConfidence: 0.82,
      observations: ['lethargy'],
      uploadedAt: WHEN,
    };
    expect(MediaSchema.safeParse(row).success).toBe(true);
  });

  it('rejects a confidence above 1', () => {
    const row = {
      id: ID,
      farmerPhone: '+2348012345678',
      mime: 'audio/mp4',
      r2Key: 'a.m4a',
      kind: 'audio',
      transcriptConfidence: 1.4,
      uploadedAt: WHEN,
    };
    expect(MediaSchema.safeParse(row).success).toBe(false);
  });
});

describe('isReliable', () => {
  it('treats a missing confidence as unreliable', () => {
    expect(isReliable(undefined)).toBe(false);
  });

  it(`is reliable at or above ${CONFIDENCE_THRESHOLD}`, () => {
    expect(isReliable(0.6)).toBe(true);
    expect(isReliable(0.82)).toBe(true);
  });

  it('is not reliable below the threshold', () => {
    expect(isReliable(0.59)).toBe(false);
  });
});