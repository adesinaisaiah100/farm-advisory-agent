import { describe, expect, it } from 'vitest';
import * as media from './index.js';

describe('public surface', () => {
  it('exports the pipeline entry point', () => {
    expect(typeof media.ingestMedia).toBe('function');
  });

  it('exports the storage, transcription and vision seams', () => {
    expect(typeof media.R2MediaStore).toBe('function');
    expect(typeof media.InMemoryMediaStore).toBe('function');
    expect(typeof media.GeminiTranscriber).toBe('function');
    expect(typeof media.GeminiVisionProvider).toBe('function');
  });

  it('re-exports the confidence gate from @poultry/schemas rather than redefining it', () => {
    // Both used to be defined here, and the local copy could not represent a
    // missing confidence. The gate must be the canonical one.
    expect(media.CONFIDENCE_THRESHOLD).toBe(0.6);
    expect(media.isReliable(undefined)).toBe(false);
  });

  it('re-exports the Media schema from @poultry/schemas', () => {
    expect(media.MediaSchema.safeParse({}).success).toBe(false);
  });

  it('exposes the media error type for callers to branch on', () => {
    expect(new media.MediaError('x', 'y')).toBeInstanceOf(Error);
  });
});
