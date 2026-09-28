import { z } from 'zod';
import { toBase64 } from './base64.js';
import { MediaError } from './key.js';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_VISION_MODEL = 'gemini-3.1-flash-lite';

export const MAX_OBSERVATIONS = 8;

export const ObservationsSchema = z.object({
  observations: z.array(z.string().min(1)).max(MAX_OBSERVATIONS),
});

export type Observations = z.infer<typeof ObservationsSchema>;

export interface VisionProvider {
  observe(input: { image: Uint8Array; mime: string }): Promise<Observations>;
}

export interface GeminiVisionOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

const GenerateResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string() })) }),
      }),
    )
    .min(1, 'response carried no candidates'),
});

/**
 * Observations describe what is visibly in the photo and nothing else. The
 * model is told not to name a disease, because a mislabelled observation becomes
 * a mislabelled case record, and the case record is the surveillance layer the
 * ministry is meant to trust.
 */
export function observePrompt(): string {
  return [
    'Describe this poultry photograph.',
    'Report only what is directly visible. Rules:',
    '- Describe physical signs: discharge, breathing, feathers, posture, litter, wounds, droppings.',
    '- Do NOT name or suggest a disease, do not give a diagnosis, and do not recommend a treatment.',
    '- Do not infer anything about age, breed, flock size or mortality that is not visible.',
    '- Each observation must be a short standalone sentence a vet could act on.',
    `- Return at most ${MAX_OBSERVATIONS} observations, most important first.`,
    'Reply with JSON only, shaped as {"observations": ["..."]}.',
  ].join('\n');
}

export class GeminiVisionProvider implements VisionProvider {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;

  constructor(options: GeminiVisionOptions) {
    if (!options.apiKey) throw new MediaError('missing_api_key', 'GeminiVisionProvider needs an apiKey');
    this.#apiKey = options.apiKey;
    this.#model = options.model ?? DEFAULT_VISION_MODEL;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  async observe(input: { image: Uint8Array; mime: string }): Promise<Observations> {
    if (input.image.byteLength === 0) {
      throw new MediaError('empty_image', 'refusing to observe an empty image body');
    }
    const url = `${this.#baseUrl}/models/${this.#model}:generateContent`;
    const response = await this.#fetch(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': this.#apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: observePrompt() },
              {
                inlineData: {
                  mimeType: input.mime,
                  data: toBase64(input.image),
                },
              },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new MediaError(
        'observe_failed',
        `vision request failed with ${response.status} ${response.statusText}: ${detail.slice(0, 300)}`,
      );
    }

    const parsed = GenerateResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new MediaError(
        'observe_bad_response',
        `vision response did not match the contract: ${parsed.error.message}`,
      );
    }

    const text = (parsed.data.candidates[0]?.content.parts ?? [])
      .map((part) => part.text)
      .join('')
      .trim();

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new MediaError('observe_bad_json', `vision model did not return JSON: ${text.slice(0, 200)}`);
    }

    const observations = ObservationsSchema.safeParse(json);
    if (!observations.success) {
      throw new MediaError(
        'observe_bad_shape',
        `vision payload did not match the contract: ${observations.error.message}`,
      );
    }

    return observations.data;
  }
}
