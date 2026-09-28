import { config as loadEnv } from 'dotenv';
import { afterAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  InMemoryMediaStore,
  R2MediaStore,
  type R2BucketLike,
  type R2PutValue,
} from './store.js';
import { GeminiTranscriber } from './transcribe.js';
import { GeminiVisionProvider } from './vision.js';
import { ingestMedia, type IngestDeps } from './pipeline.js';

loadEnv({ path: '../../.env' });

const RUN_INTEG = process.env.RUN_INTEG === '1';
const PHONE = '+2348082974602';
const CLOCK = '2026-09-28T00:00:00.000Z';

/**
 * Real R2, reached over the S3 endpoint with the same credentials the Workers
 * binding uses. Cloudflare's `R2Bucket` type only exists inside Workers, so this
 * proves the key format, the content-type metadata and the wire protocol rather
 * than the binding itself.
 */
async function s3Bucket(): Promise<R2BucketLike> {
  const accountId = required('R2_ACCOUNT_ID');
  const accessKeyId = required('R2_ACCESS_KEY_ID');
  const secretAccessKey = required('R2_SECRET_ACCESS_KEY');
  const bucketName = required('R2_BUCKET');

  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import(
    '@aws-sdk/client-s3'
  );
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  /**
   * The R2 binding accepts a string, ArrayBuffer or stream, matching our
   * `R2BucketLike`. The S3 SDK only takes bytes, so the value is normalized here
   * rather than by loosening the interface away from the real binding.
   */
  const toBytes = (value: R2PutValue): Uint8Array => {
    if (typeof value === 'string') return new TextEncoder().encode(value);
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    throw new Error('stream bodies cannot be replayed through the S3 endpoint');
  };

  return {
    put: async (key, value, options) => {
      await client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: toBytes(value),
          ContentType: options?.httpMetadata?.contentType,
        }),
      );
    },
    get: async (key) => {
      const result = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
      return {
        arrayBuffer: async () => {
          const bytes = await (result.Body as { transformToByteArray(): Promise<Uint8Array> })
            .transformToByteArray();
          return bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer;
        },
        httpMetadata: { contentType: result.ContentType },
        uploaded: result.LastModified,
      };
    },
    delete: async (key) => {
      await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
    },
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is not set; the media integ test needs real credentials`);
  }
  return value;
}

/**
 * Words that would mean the photo has been turned into advice. "give" and "mg"
 * matter as much as the drug names, because "give 5 ml" is the failure.
 */
const FORBIDDEN_IN_OBSERVATIONS =
  /\b(diagnos|coccidi|newcastle|gumboro|infectious bronchitis|paramyxo|treat|give|dose|mg|ml|antibiotic|amoxicillin|ciprofloxacin|vaccin)\w*/i;

/**
 * Committed fixtures are the default so the verification is reproducible. The env
 * vars exist because the two gaps documented in `tests/fixtures/README.md` need
 * real recordings and photos that cannot be committed.
 */
const FIXTURES = new URL('../tests/fixtures/', import.meta.url);

function fixturePath(name: string, override: string | undefined, fallback: string): string {
  return override ?? fileURLToPath(new URL(fallback, FIXTURES));
}

/**
 * The mime has to match the real bytes: sending a WAV labelled `audio/mpeg` is
 * how a transcription request gets rejected for reasons that have nothing to do
 * with the transcription.
 */
function audioMime(path: string): string {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  const mimes: Record<string, string> = {
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.mp4': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.webm': 'audio/webm',
  };
  const mime = mimes[ext];
  if (mime === undefined) throw new Error(`${ext} is not a transcription format this test knows`);
  return mime;
}

function imageMime(path: string): string {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  const mimes: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
  const mime = mimes[ext];
  if (mime === undefined) throw new Error(`${ext} is not an image format this test knows`);
  return mime;
}

const uploaded: string[] = [];

afterAll(async () => {
  if (uploaded.length === 0) return;
  const bucket = await s3Bucket();
  for (const key of uploaded) {
    await bucket.delete(key).catch(() => undefined);
  }
});

function deps(overrides: Partial<IngestDeps> = {}): IngestDeps {
  return {
    store: new InMemoryMediaStore(),
    now: () => new Date(CLOCK),
    newId: () => crypto.randomUUID(),
    ...overrides,
  };
}

describe.sequential('media integ (real R2 + real Gemini)', () => {
  it('round-trips a real object through R2 and preserves its content type', async () => {
    if (!RUN_INTEG) return;
    const store = new R2MediaStore(await s3Bucket());
    const body = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

    const result = await ingestMedia(deps({ store }), {
      phone: PHONE,
      mime: 'application/pdf',
      body,
    });
    if (result.kind !== 'ready') throw new Error('expected ready');
    uploaded.push(result.media.r2Key);

    expect(result.media.r2Key).toMatch(
      /^media\/2348082974602\/2026-09-28\/[0-9a-f-]{36}\.pdf$/,
    );
    const read = await store.get(result.media.r2Key);
    expect(read?.contentType).toBe('application/pdf');
    expect(Array.from(read?.body ?? [])).toEqual(Array.from(body));
  });

  it('refuses a zero-byte upload to real R2', async () => {
    if (!RUN_INTEG) return;
    const store = new R2MediaStore(await s3Bucket());

    await expect(
      ingestMedia(deps({ store }), {
        phone: PHONE,
        mime: 'application/pdf',
        body: new Uint8Array(),
      }),
    ).rejects.toThrow(/empty body/);
  });

  it('transcribes a real recording and reports no confidence, so the farmer is asked', async () => {
    if (!RUN_INTEG) return;
    // The committed WAV, deliberately not the env override: this golden pins the
    // English fixture, and the Pidgin test is where an override belongs.
    const audioPath = fileURLToPath(new URL('farmer-voice-note.wav', FIXTURES));
    const audio = new Uint8Array(await readFile(audioPath));
    const transcriber = new GeminiTranscriber({ apiKey: required('GEMINI_API_KEY') });

    const result = await transcriber.transcribe({ audio, mime: audioMime(audioPath) });

    // Golden: the words actually spoken in `farmer-voice-note.wav`. This pins the
    // verbatim contract, so a model upgrade that paraphrases the farmer fails
    // here on purpose rather than silently rewording what a farmer said.
    expect(result.text).toBe(
      'The birds are sitting down and they are not eating. The litter is wet and there is blood near the vent.',
    );
    // The point of the test: Gemini gives no confidence, so the gate stays shut.
    expect(result.confidence).toBeUndefined();
  });

  it('sends a real Gemini transcript down the confirmation path', async () => {
    if (!RUN_INTEG) return;
    const audioPath = fixturePath('PIDGIN_FIXTURE_AUDIO', process.env.PIDGIN_FIXTURE_AUDIO, 'farmer-voice-note.wav');
    const audio = new Uint8Array(await readFile(audioPath));
    const transcriber = new GeminiTranscriber({ apiKey: required('GEMINI_API_KEY') });

    const result = await ingestMedia(deps({ transcriber }), {
      phone: PHONE,
      mime: audioMime(audioPath),
      body: audio,
    });

    expect(result.kind).toBe('needs_confirmation');
    if (result.kind !== 'needs_confirmation') throw new Error('expected confirmation');
    expect(result.reason).toBe('no_confidence');
    expect(result.media.transcript).toBeTruthy();
  });

  it('transcribes real Pidgin verbatim, without translating or tidying it', async () => {
    if (!RUN_INTEG) return;
    const path = process.env.PIDGIN_FIXTURE_AUDIO;
    if (path === undefined) {
      // Opt-in on purpose: the recording is a real voice, so it is not committed
      // by default. See tests/fixtures/README.md.
      throw new Error(
        'PIDGIN_FIXTURE_AUDIO is not set. Point it at a real Pidgin voice note to ' +
          'prove the claim that matters most: that the farmer is transcribed, not translated.',
      );
    }
    const audio = new Uint8Array(await readFile(path));
    const transcriber = new GeminiTranscriber({ apiKey: required('GEMINI_API_KEY') });

    const result = await transcriber.transcribe({ audio, mime: audioMime(path) });

    // Every Pidgin construction below is in the recording. If the model tidied
    // the speech into formal English, or translated it, these all fail.
    expect(result.text).toContain('I no sabi');
    expect(result.text).toContain('dey no dey chop');
    expect(result.text).toContain('broilers');
    expect(result.text).toContain('Abeg, make una help me');
    // Nothing that reads as a translation of the farmer.
    expect(result.text).not.toMatch(/\bI do not know\b|\bplease help me\b|\bI don't know\b/i);
    expect(result.confidence).toBeUndefined();
  });

  it('observes a real photo and returns no diagnosis or drug name', async () => {
    if (!RUN_INTEG) return;
    const imagePath = fixturePath('PHOTO_FIXTURE_IMAGE', process.env.PHOTO_FIXTURE_IMAGE, 'broiler-chicks.jpg');
    const image = new Uint8Array(await readFile(imagePath));
    const vision = new GeminiVisionProvider({ apiKey: required('GEMINI_API_KEY') });

    const result = await vision.observe({ image, mime: imageMime(imagePath) });

    expect(result.observations.length).toBeGreaterThan(0);
    for (const observation of result.observations) {
      expect(observation).not.toMatch(FORBIDDEN_IN_OBSERVATIONS);
    }
  });

  it('still refuses to name the disease when the bird is visibly sick', async () => {
    if (!RUN_INTEG) return;
    // The fixture's bird has confirmed Newcastle disease, so the answer is known:
    // if the model ever names it, the no-diagnosis rule has leaked. This is the
    // case that matters, and the healthy-chick photo above cannot detect it.
    const imagePath = fileURLToPath(new URL('unwell-bird-newcastle.jpg', FIXTURES));
    const image = new Uint8Array(await readFile(imagePath));
    const vision = new GeminiVisionProvider({ apiKey: required('GEMINI_API_KEY') });

    const result = await vision.observe({ image, mime: 'image/jpeg' });

    expect(result.observations.length).toBeGreaterThan(0);
    for (const observation of result.observations) {
      expect(observation).not.toMatch(FORBIDDEN_IN_OBSERVATIONS);
      // The ground truth for this specific bird.
      expect(observation).not.toMatch(/newcastle|paramyxo|viral/i);
    }
    // It must still say something useful, or "safe" has just become "useless".
    expect(result.observations.join(' ')).toMatch(/feather|posture|eye|neck|breath|lying/i);
  });
});
