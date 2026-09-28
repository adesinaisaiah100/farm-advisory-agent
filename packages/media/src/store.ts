import { MediaError, MediaKeySchema } from './key.js';

export interface StoredObject {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly uploadedAt: Date;
}

/**
 * Object storage for farmer media. The interface is deliberately narrower than
 * R2's: the bridge and the API run on different hosts, and only these three
 * operations are needed, so a fake is a handful of lines.
 */
export interface MediaStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

/** The value shapes the R2 binding accepts that this package actually sends. */
export type R2PutValue = ArrayBuffer | Uint8Array;

/** The subset of Cloudflare's R2Bucket this package uses. */
export interface R2BucketLike {
  put(
    key: string,
    value: R2PutValue,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{
    arrayBuffer(): Promise<ArrayBuffer>;
    httpMetadata?: { contentType?: string };
    uploaded?: Date;
  } | null>;
  delete(key: string): Promise<void>;
}

export class R2MediaStore implements MediaStore {
  readonly #bucket: R2BucketLike;

  constructor(bucket: R2BucketLike) {
    this.#bucket = bucket;
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    MediaKeySchema.parse(key);
    if (body.byteLength === 0) {
      throw new MediaError('empty_body', `refusing to store an empty body at ${key}`);
    }
    await this.#bucket.put(key, body, { httpMetadata: { contentType } });
  }

  async get(key: string): Promise<StoredObject | null> {
    const object = await this.#bucket.get(key);
    if (object === null) return null;
    return {
      body: new Uint8Array(await object.arrayBuffer()),
      contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
      uploadedAt: object.uploaded ?? new Date(0),
    };
  }

  async delete(key: string): Promise<void> {
    await this.#bucket.delete(key);
  }
}

export class InMemoryMediaStore implements MediaStore {
  readonly #objects = new Map<string, StoredObject>();
  /** Keyed `get` calls, so a test can assert a key was read exactly once. */
  readonly reads: string[] = [];

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    MediaKeySchema.parse(key);
    if (body.byteLength === 0) {
      throw new MediaError('empty_body', `refusing to store an empty body at ${key}`);
    }
    this.#objects.set(key, {
      body: body.slice(),
      contentType,
      uploadedAt: new Date(0),
    });
  }

  async get(key: string): Promise<StoredObject | null> {
    this.reads.push(key);
    return this.#objects.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.#objects.delete(key);
  }

  get size(): number {
    return this.#objects.size;
  }

  keys(): string[] {
    return [...this.#objects.keys()].sort();
  }
}
