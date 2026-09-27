import { z } from 'zod';
import {
  DEFAULT_EMBED_MODEL,
  EMBED_DIMS,
  EmbedError,
  assertDims,
  l2Normalize,
  type EmbedOptions,
  type EmbedTaskType,
  type Embedder,
} from './embedder.js';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_BATCH_SIZE = 100;

const BatchResponseSchema = z.object({
  embeddings: z
    .array(z.object({ values: z.array(z.number()) }))
    .min(1, 'response carried no embeddings'),
});

export interface GeminiEmbedderOptions {
  apiKey: string;
  model?: string;
  dims?: number;
  /** Mirrors GEMINI_EMBED_NORMALIZE. */
  normalize?: boolean;
  /** Injected in tests so no unit test needs a key or a socket. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  batchSize?: number;
}

interface EmbedPart {
  text: string;
}

interface EmbedRequestItem {
  model: string;
  content: { parts: EmbedPart[] };
  outputDimensionality: number;
  taskType?: EmbedTaskType;
}

function chunked<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new EmbedError(`batchSize must be positive, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export class GeminiEmbedder implements Embedder {
  readonly dims: number;

  readonly #apiKey: string;
  readonly #model: string;
  readonly #normalize: boolean;
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;
  readonly #batchSize: number;

  constructor(options: GeminiEmbedderOptions) {
    if (!options.apiKey) throw new EmbedError('GeminiEmbedder needs an apiKey');
    this.dims = options.dims ?? EMBED_DIMS;
    this.#apiKey = options.apiKey;
    this.#model = options.model ?? DEFAULT_EMBED_MODEL;
    this.#normalize = options.normalize ?? true;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.#batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  }

  async embed(
    texts: readonly string[],
    options: EmbedOptions = {},
  ): Promise<readonly (readonly number[])[]> {
    if (texts.length === 0) return [];

    const vectors: number[][] = [];
    for (const batch of chunked(texts, this.#batchSize)) {
      vectors.push(...(await this.#embedBatch(batch, options.taskType)));
    }

    if (vectors.length !== texts.length) {
      throw new EmbedError(`asked for ${texts.length} embeddings, received ${vectors.length}`);
    }
    return vectors;
  }

  async #embedBatch(texts: readonly string[], taskType?: EmbedTaskType): Promise<number[][]> {
    const body = {
      requests: texts.map((text) => {
        const item: EmbedRequestItem = {
          model: `models/${this.#model}`,
          content: { parts: [{ text }] },
          outputDimensionality: this.dims,
        };
        if (taskType !== undefined) item.taskType = taskType;
        return item;
      }),
    };

    const url = `${this.#baseUrl}/models/${this.#model}:batchEmbedContents`;
    const response = await this.#fetch(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': this.#apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new EmbedError(
        `embedding request failed with ${response.status} ${response.statusText}: ${detail.slice(0, 300)}`,
      );
    }

    const parsed = BatchResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new EmbedError(`embedding response did not match the contract: ${parsed.error.message}`);
    }

    return parsed.data.embeddings.map((embedding, index) => {
      assertDims(embedding.values, this.dims, `embedding ${index}`);
      return this.#normalize ? l2Normalize(embedding.values) : embedding.values;
    });
  }
}
