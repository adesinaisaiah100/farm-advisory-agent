import { config as loadEnv } from 'dotenv';
import { afterAll, describe, expect, it } from 'vitest';
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
 * A synthesised clip is not a Pidgin voice note, so this fixture cannot be
 * committed. An operator supplies their own recording; there is no fake.
 */
function fixture(name: string, what: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(
      `${name} is not set. Point it at a real ${what} on disk to exercise this; ` +
        `the transcription and vision paths cannot be proven without one.`,
    );
  }
  return value;
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
    const audioPath = fixture('PIDGIN_FIXTURE_AUDIO', 'Pidgin voice note (.m4a/.mp3/.wav)');
    const { readFile } = await import('node:fs/promises');
    const audio = new Uint8Array(await readFile(audioPath));
    const transcriber = new GeminiTranscriber({ apiKey: required('GEMINI_API_KEY') });

    const result = await transcriber.transcribe({ audio, mime: 'audio/mpeg' });

    expect(result.text.length).toBeGreaterThan(0);
    // The point of the test: Gemini gives no confidence, so the gate stays shut.
    expect(result.confidence).toBeUndefined();
  });

  it('sends a real Gemini transcript down the confirmation path', async () => {
    if (!RUN_INTEG) return;
    const audioPath = fixture('PIDGIN_FIXTURE_AUDIO', 'Pidgin voice note (.m4a/.mp3/.wav)');
    const { readFile } = await import('node:fs/promises');
    const audio = new Uint8Array(await readFile(audioPath));
    const transcriber = new GeminiTranscriber({ apiKey: required('GEMINI_API_KEY') });

    const result = await ingestMedia(deps({ transcriber }), {
      phone: PHONE,
      mime: 'audio/mpeg',
      body: audio,
    });

    expect(result.kind).toBe('needs_confirmation');
    if (result.kind !== 'needs_confirmation') throw new Error('expected confirmation');
    expect(result.reason).toBe('no_confidence');
    expect(result.media.transcript).toBeTruthy();
  });

  it('observes a real photo and returns no diagnosis or drug name', async () => {
    if (!RUN_INTEG) return;
    const imagePath = fixture('PHOTO_FIXTURE_IMAGE', 'poultry photo (.jpg/.png)');
    const { readFile } = await import('node:fs/promises');
    const image = new Uint8Array(await readFile(imagePath));
    const vision = new GeminiVisionProvider({ apiKey: required('GEMINI_API_KEY') });

    const result = await vision.observe({ image, mime: 'image/jpeg' });

    expect(result.observations.length).toBeGreaterThan(0);
    const forbidden =
      /\b(diagnos|coccidi|newcastle|gumboro|infectious bronchitis|treat|give|dose|mg|ml|antibiotic|amoxicillin|ciprofloxacin)\w*/i;
    for (const observation of result.observations) {
      expect(observation).not.toMatch(forbidden);
    }
  });
});
