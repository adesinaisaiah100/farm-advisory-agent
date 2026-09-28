import { describe, expect, it, vi } from 'vitest';
import { CONFIDENCE_THRESHOLD, isReliable } from '@poultry/schemas';
import { MediaError } from './key.js';
import { InMemoryMediaStore } from './store.js';
import { ingestMedia, kindFor, type IngestDeps } from './pipeline.js';
import type { Transcript, Transcriber } from './transcribe.js';
import type { Observations, VisionProvider } from './vision.js';

const id = '018f3c2a-1b2c-7d4e-8f90-0123456789ab';
const phone = '+2348082974602';

function fixedDeps(overrides: Partial<IngestDeps> = {}): IngestDeps {
  return {
    store: new InMemoryMediaStore(),
    now: () => new Date('2026-09-28T14:03:11.000Z'),
    newId: () => id,
    ...overrides,
  };
}

function transcriberReturning(result: Transcript): Transcriber {
  return { transcribe: async () => result };
}

function visionReturning(observations: string[]): VisionProvider {
  return { observe: async (): Promise<Observations> => ({ observations }) };
}

describe('kindFor', () => {
  it('maps mime prefixes to media kinds', () => {
    expect(kindFor('audio/mpeg')).toBe('audio');
    expect(kindFor('image/jpeg')).toBe('image');
    expect(kindFor('video/mp4')).toBe('video');
    expect(kindFor('application/pdf')).toBe('document');
  });

  it('refuses to guess a kind for an unknown mime type', () => {
    expect(() => kindFor('text/csv')).toThrow(/refusing to guess/);
  });
});

describe('isReliable threshold matrix', () => {
  it('treats an absent confidence as unreliable', () => {
    expect(isReliable(undefined)).toBe(false);
  });

  it('rejects a score below the threshold', () => {
    expect(isReliable(CONFIDENCE_THRESHOLD - 0.01)).toBe(false);
  });

  it('accepts a score exactly at the threshold', () => {
    expect(isReliable(CONFIDENCE_THRESHOLD)).toBe(true);
  });

  it('accepts a score above the threshold', () => {
    expect(isReliable(0.99)).toBe(true);
  });

  it('rejects a zero score', () => {
    expect(isReliable(0)).toBe(false);
  });
});

describe('ingestMedia audio', () => {
  const audio = new Uint8Array([1, 2, 3]);

  it('stores the audio under a media key and returns ready when confidence is high', async () => {
    const store = new InMemoryMediaStore();
    const deps = fixedDeps({
      store,
      transcriber: transcriberReturning({ text: 'my birds dey die', confidence: 0.91 }),
    });

    const result = await ingestMedia(deps, { phone, mime: 'audio/mpeg', body: audio });

    expect(result.kind).toBe('ready');
    expect(store.keys()).toEqual([`media/2348082974602/2026-09-28/${id}.mp3`]);
    if (result.kind !== 'ready') throw new Error('expected ready');
    expect(result.media.transcript).toBe('my birds dey die');
    expect(result.media.transcriptConfidence).toBe(0.91);
  });

  it('asks the farmer to confirm when the transcript has no confidence', async () => {
    const deps = fixedDeps({
      transcriber: transcriberReturning({ text: 'wetin dey happen' }),
    });

    const result = await ingestMedia(deps, { phone, mime: 'audio/mpeg', body: audio });

    expect(result.kind).toBe('needs_confirmation');
    if (result.kind !== 'needs_confirmation') throw new Error('expected confirmation');
    expect(result.reason).toBe('no_confidence');
    expect(result.question).toContain('wetin dey happen');
  });

  it('reports a low score differently from a missing one', async () => {
    const deps = fixedDeps({
      transcriber: transcriberReturning({ text: 'birds dey die', confidence: 0.42 }),
    });

    const result = await ingestMedia(deps, { phone, mime: 'audio/mpeg', body: audio });

    expect(result.kind).toBe('needs_confirmation');
    if (result.kind !== 'needs_confirmation') throw new Error('expected confirmation');
    expect(result.reason).toBe('low_confidence');
  });

  it('keeps the audio stored even when the transcript needs confirming', async () => {
    const store = new InMemoryMediaStore();
    const deps = fixedDeps({
      store,
      transcriber: transcriberReturning({ text: 'unclear' }),
    });

    await ingestMedia(deps, { phone, mime: 'audio/mpeg', body: audio });

    expect(store.size).toBe(1);
  });

  it('never records a confidence the model did not report', async () => {
    const deps = fixedDeps({ transcriber: transcriberReturning({ text: 'hello' }) });

    const result = await ingestMedia(deps, { phone, mime: 'audio/mpeg', body: audio });

    if (result.kind !== 'needs_confirmation') throw new Error('expected confirmation');
    expect(result.media.transcriptConfidence).toBeUndefined();
  });

  it('normalises the farmer number before it reaches storage', async () => {
    const store = new InMemoryMediaStore();
    const deps = fixedDeps({
      store,
      transcriber: transcriberReturning({ text: 'hi', confidence: 0.8 }),
    });

    const result = await ingestMedia(deps, { phone: '08082974602', mime: 'audio/mpeg', body: audio });

    if (result.kind !== 'ready') throw new Error('expected ready');
    expect(result.media.farmerPhone).toBe(phone);
    expect(store.keys()[0]).toContain('media/2348082974602/');
  });

  it('refuses audio without a transcriber rather than storing it unread', async () => {
    const deps = fixedDeps();

    await expect(ingestMedia(deps, { phone, mime: 'audio/mpeg', body: audio })).rejects.toThrow(
      /needs a transcriber/,
    );
  });

  it('links the media to a case when one is supplied', async () => {
    const caseId = '018f3c2a-1b2c-7d4e-8f90-999999999999';
    const deps = fixedDeps({
      transcriber: transcriberReturning({ text: 'hi', confidence: 0.8 }),
    });

    const result = await ingestMedia(deps, {
      phone,
      mime: 'audio/mpeg',
      body: audio,
      caseId,
    });

    if (result.kind !== 'ready') throw new Error('expected ready');
    expect(result.media.caseId).toBe(caseId);
  });
});

describe('ingestMedia image', () => {
  const image = new Uint8Array([9, 9]);

  it('records vision observations and returns ready without a confidence gate', async () => {
    const deps = fixedDeps({
      vision: visionReturning(['greenish discharge at the nostril', 'birds huddling']),
    });

    const result = await ingestMedia(deps, { phone, mime: 'image/jpeg', body: image });

    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') throw new Error('expected ready');
    expect(result.media.observations).toEqual([
      'greenish discharge at the nostril',
      'birds huddling',
    ]);
    expect(result.media.transcript).toBeUndefined();
  });

  it('refuses an image without a vision provider', async () => {
    const deps = fixedDeps();

    await expect(ingestMedia(deps, { phone, mime: 'image/jpeg', body: image })).rejects.toThrow(
      /needs a vision provider/,
    );
  });
});

describe('ingestMedia other kinds', () => {
  it('stores a document without reading it in this phase', async () => {
    const store = new InMemoryMediaStore();
    const deps = fixedDeps({ store });

    const result = await ingestMedia(deps, {
      phone,
      mime: 'application/pdf',
      body: new Uint8Array([1]),
    });

    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') throw new Error('expected ready');
    expect(result.media.kind).toBe('document');
    expect(store.keys()[0]).toMatch(/\.pdf$/);
  });

  it('stores a video without a transcriber', async () => {
    const deps = fixedDeps();

    const result = await ingestMedia(deps, {
      phone,
      mime: 'video/mp4',
      body: new Uint8Array([1]),
    });

    expect(result.kind).toBe('ready');
  });

  it('rejects an unsupported mime type before touching the store', async () => {
    const store = new InMemoryMediaStore();
    const deps = fixedDeps({ store });

    await expect(
      ingestMedia(deps, { phone, mime: 'application/x-msdownload', body: new Uint8Array([1]) }),
    ).rejects.toThrow(MediaError);
    expect(store.size).toBe(0);
  });

  it('takes the kind from the mime type, so a voice note cannot be filed as a photo', async () => {
    // The mime comes from WhatsApp, so a caller able to assert a kind could skip
    // transcription and the confirmation gate and record a statement the farmer
    // never made. The kind is therefore not an input, and the audio path below
    // stays shut.
    const store = new InMemoryMediaStore();
    const observe = vi.fn<VisionProvider['observe']>();
    const transcribe = vi.fn<Transcriber['transcribe']>().mockResolvedValue({
      text: 'the birds are sitting down and not eating',
      confidence: undefined,
    });
    const deps = fixedDeps({ store, vision: { observe }, transcriber: { transcribe } });

    const result = await ingestMedia(deps, {
      phone,
      mime: 'audio/mpeg',
      body: new Uint8Array([1]),
      ...({ kind: 'image' } as unknown as Record<string, never>),
    });

    expect(result.kind).toBe('needs_confirmation');
    expect(observe).not.toHaveBeenCalled();
    expect(transcribe).toHaveBeenCalledTimes(1);
  });
});
