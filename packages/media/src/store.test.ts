import { describe, expect, it } from 'vitest';
import { MediaError, mediaKey } from './key.js';
import { InMemoryMediaStore, R2MediaStore } from './store.js';

const day = new Date('2026-09-28T14:03:11.000Z');
const id = '018f3c2a-1b2c-7d4e-8f90-0123456789ab';
const key = mediaKey({ phone: '+2348082974602', date: day, id, mime: 'image/jpeg' });
const body = new Uint8Array([1, 2, 3, 4]);

function fakeBucket() {
  const objects = new Map<
    string,
    { bytes: Uint8Array; contentType?: string; uploaded: Date }
  >();
  return {
    objects,
    bucket: {
      put: async (
        k: string,
        value: ArrayBuffer | Uint8Array,
        options?: { httpMetadata?: { contentType?: string } },
      ) => {
        objects.set(k, {
          bytes: new Uint8Array(value as ArrayBuffer),
          contentType: options?.httpMetadata?.contentType,
          uploaded: day,
        });
      },
      get: async (k: string) => {
        const found = objects.get(k);
        if (found === undefined) return null;
        return {
          arrayBuffer: async () =>
            found.bytes.buffer.slice(
              found.bytes.byteOffset,
              found.bytes.byteOffset + found.bytes.byteLength,
            ) as ArrayBuffer,
          httpMetadata: { contentType: found.contentType },
          uploaded: found.uploaded,
        };
      },
      delete: async (k: string) => {
        objects.delete(k);
      },
    },
  };
}

describe.each([
  ['InMemoryMediaStore', (): InMemoryMediaStore => new InMemoryMediaStore()],
  ['R2MediaStore', (): R2MediaStore => new R2MediaStore(fakeBucket().bucket)],
])('%s', (_name, make) => {
  it('round-trips a body with its content type', async () => {
    const store = make();
    await store.put(key, body, 'image/jpeg');

    const read = await store.get(key);

    expect(read?.body).toEqual(body);
    expect(read?.contentType).toBe('image/jpeg');
  });

  it('returns null for a key that was never written', async () => {
    const store = make();
    expect(await store.get(`${key}x`)).toBeNull();
  });

  it('removes an object on delete', async () => {
    const store = make();
    await store.put(key, body, 'image/jpeg');

    await store.delete(key);

    expect(await store.get(key)).toBeNull();
  });

  it('does not alias the caller buffer, so a later mutation cannot rewrite history', async () => {
    const store = make();
    const mutable = new Uint8Array([9, 9, 9]);
    await store.put(key, mutable, 'image/jpeg');

    mutable[0] = 0;

    expect((await store.get(key))?.body[0]).toBe(9);
  });

  it('refuses to store an empty body', async () => {
    const store = make();
    await expect(store.put(key, new Uint8Array(), 'image/jpeg')).rejects.toThrow(MediaError);
  });

  it('refuses a key that is not a media key', async () => {
    const store = make();
    await expect(store.put('../../etc/passwd', body, 'image/jpeg')).rejects.toThrow();
  });
});

describe('R2MediaStore', () => {
  it('stores exactly the bytes it was handed', async () => {
    const { bucket, objects } = fakeBucket();
    const store = new R2MediaStore(bucket);

    await store.put(key, body, 'image/jpeg');

    expect(objects.get(key)?.bytes).toEqual(body);
  });

  it('falls back to a binary content type when R2 has no metadata', async () => {
    const bucket = {
      put: async () => undefined,
      get: async () => ({
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
      delete: async () => undefined,
    };
    const store = new R2MediaStore(bucket);

    const read = await store.get(key);

    expect(read?.contentType).toBe('application/octet-stream');
  });
});
