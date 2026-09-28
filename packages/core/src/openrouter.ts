import { z } from 'zod';
import { chatSystemPrompt, caseSummary, dropNullProperties, LlmError } from './gemini.js';
import type { ChatProvider, ChatInput } from './providers.js';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'openrouter/free';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_TEMPERATURE = 0.3;

const OpenRouterResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
        finish_reason: z.string().optional(),
      }),
    )
    .min(1, 'OpenRouter returned no choices'),
  error: z
    .object({
      message: z.string().optional(),
      code: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
});

export interface OpenRouterChatProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  temperature?: number;
  fetchImpl?: typeof fetch;
}

export class OpenRouterChatProvider implements ChatProvider {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #temperature: number;
  readonly #fetch: typeof fetch;

  constructor(options: OpenRouterChatProviderOptions) {
    if (!options.apiKey) {
      throw new LlmError('missing_api_key', 'OpenRouterChatProvider needs an apiKey');
    }
    this.#apiKey = options.apiKey;
    this.#model = options.model ?? DEFAULT_MODEL;
    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#temperature = options.temperature ?? DEFAULT_TEMPERATURE;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async complete(input: ChatInput): Promise<unknown> {
    const notes =
      input.notes.length > 0 ? `Notes carried from earlier turns:\n${input.notes.join('\n')}` : '';
    const context = input.farmerContext ?? '';
    const caseBlock = caseSummary(input.filled, input.missing);

    const instruction = [
      caseBlock,
      notes,
      context ? `About this farmer:\n${context}` : '',
      input.history.length > 0
        ? `Conversation so far:\n${input.history.map((m) => `${m.role}: ${m.text}`).join('\n')}`
        : 'This is the first message in the conversation.',
    ]
      .filter((block) => block.length > 0)
      .join('\n\n');

    const systemPrompt = [
      chatSystemPrompt(input.replyLanguage),
      '',
      instruction,
      '',
      'Return ONLY a valid JSON object matching this schema:',
      '{',
      '  "delta": {',
      '    "species": "broiler" | "layer" | "cockerel" | "turkey" | "local" | undefined,',
      '    "breed": string | undefined,',
      '    "birdStage": "chick" | "grower" | "finisher" | "layer" | "point_of_lay" | undefined,',
      '    "farmSize": number | undefined,',
      '    "flockAgeWeeks": number | undefined,',
      '    "symptoms": string[] | undefined,',
      '    "onsetDays": number | undefined,',
      '    "mortalityCount": number | undefined,',
      '    "mortalityRatePct": number | undefined,',
      '    "diseaseText": string | undefined,',
      '    "diseaseHits": string[] | undefined,',
      '    "needsConfirmation": string[] | undefined,',
      '    "wantsSupply": boolean | undefined',
      '  },',
      '  "profile": {',
      '    "name": string | undefined',
      '  },',
      '  "reply": string',
      '}',
    ].join('\n');

    const messages = [
      { role: 'system', content: systemPrompt },
      ...input.history.map((m) => ({
        role: m.role === 'farmer' ? ('user' as const) : ('assistant' as const),
        content: m.text,
      })),
      { role: 'user' as const, content: input.query },
    ];

    const url = `${this.#baseUrl}/chat/completions`;
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.#apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/Isaiah/farm-advisory-agent',
          'X-Title': 'BirdVet Poultry Advisory',
        },
        body: JSON.stringify({
          models: Array.from(
            new Set([
              this.#model,
              'openrouter/free',
              'nvidia/nemotron-3.5-lightning:free',
              'google/gemma-4-31b-it:free',
            ]),
          ),
          messages,
          temperature: this.#temperature,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (cause) {
      throw new LlmError('llm_unreachable', `OpenRouter model was unreachable: ${String(cause)}`);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new LlmError(
        'llm_request_failed',
        `OpenRouter request failed with ${response.status} ${response.statusText}: ${detail.slice(0, 300)}`,
      );
    }

    const rawJson: unknown = await response.json();
    const parsed = OpenRouterResponseSchema.safeParse(rawJson);
    if (!parsed.success) {
      throw new LlmError(
        'llm_bad_response',
        `OpenRouter response did not match schema: ${parsed.error.message}`,
      );
    }

    if (parsed.data.error) {
      throw new LlmError(
        'llm_request_failed',
        `OpenRouter error: ${parsed.data.error.message ?? 'unknown'}`,
      );
    }

    const text = parsed.data.choices[0]?.message.content.trim() ?? '';
    if (text.length === 0) {
      throw new LlmError('llm_empty', 'OpenRouter returned empty text');
    }

    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(text);
    } catch {
      throw new LlmError('llm_not_json', 'OpenRouter returned text that is not valid JSON');
    }

    return dropNullProperties(parsedContent);
  }
}
