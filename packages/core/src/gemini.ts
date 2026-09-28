import { z } from 'zod';
import {
  BirdStageSchema,
  DiseaseSchema,
  SpeciesSchema,
} from '@poultry/schemas';
import type { ReplyLanguage } from './language.js';
import { CaseDeltaSchema, CompactionResultSchema } from './llm.js';
import type { ChatProvider, CompactProvider, TurnMessage } from './providers.js';
import type { ChatInput, CompactInput } from './providers.js';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_CHAT_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_TEMPERATURE = 0.3;

/**
 * A farmer's turn has a wall-clock budget: a WhatsApp message that answers in
 * thirty seconds is a farmer who has already given up. Abort rather than hang.
 */
export class LlmError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
  }
}

// ---------------------------------------------------------------- response schema

type FieldSpec =
  | { kind: 'string' }
  | { kind: 'number' }
  | { kind: 'boolean' }
  | { kind: 'stringArray' }
  | { kind: 'diseaseArray' }
  | { kind: 'enum'; values: readonly string[] };

/**
 * The kinds of every `CaseDelta` field. Written out because Gemini's
 * `responseSchema` is an OpenAPI subset that Zod cannot be converted into here
 * without a new dependency, but the field *names* are derived from the Zod shape
 * so a new delta field cannot silently reach the model unconstrained.
 */
const DELTA_FIELDS: Readonly<Record<string, FieldSpec>> = {
  species: { kind: 'enum', values: SpeciesSchema.options },
  breed: { kind: 'string' },
  birdStage: { kind: 'enum', values: BirdStageSchema.options },
  farmSize: { kind: 'number' },
  flockAgeWeeks: { kind: 'number' },
  symptoms: { kind: 'stringArray' },
  onsetDays: { kind: 'number' },
  mortalityCount: { kind: 'number' },
  mortalityRatePct: { kind: 'number' },
  diseaseText: { kind: 'string' },
  diseaseHits: { kind: 'diseaseArray' },
  needsConfirmation: { kind: 'stringArray' },
  wantsSupply: { kind: 'boolean' },
};

function fieldSchema(spec: FieldSpec): Record<string, unknown> {
  switch (spec.kind) {
    case 'string':
      return { type: 'STRING' };
    case 'number':
      return { type: 'NUMBER' };
    case 'boolean':
      return { type: 'BOOLEAN' };
    case 'stringArray':
      return { type: 'ARRAY', items: { type: 'STRING' } };
    case 'diseaseArray':
      return { type: 'ARRAY', items: { type: 'STRING', enum: [...DiseaseSchema.options] } };
    case 'enum':
      return { type: 'STRING', enum: [...spec.values] };
  }
}

/**
 * The structured-output contract handed to Gemini. The orchestrator still parses
 * the answer with `LlmReplySchema`, which is `.strict()`, so this schema is a
 * reliability aid rather than the contract: anything that slips past it still
 * has to survive the strict parse or the turn falls back to a coded reply.
 */
export const LLM_REPLY_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    delta: {
      type: 'OBJECT',
      properties: Object.fromEntries(
        Object.keys(CaseDeltaSchema.shape).map((field) => {
          const spec = DELTA_FIELDS[field];
          if (spec === undefined) {
            throw new LlmError('bad_response_schema', `no field kind declared for "${field}"`);
          }
          return [field, fieldSchema(spec)];
        }),
      ),
    },
    profile: {
      type: 'OBJECT',
      properties: { name: { type: 'STRING' } },
    },
    reply: { type: 'STRING' },
  },
  required: ['delta', 'reply'],
};

const LLM_COMPACT_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    notes: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['notes'],
};

// ---------------------------------------------------------------- prompts

const SAFETY_RULES: readonly string[] = [
  'Never name a specific drug, vaccine, brand, or product, and never give a dose. A separate, vetted process assembles the medicine ladder from retrieved sources; anything you name here bypasses that and can be wrong or dangerous.',
  'Never state a diagnosis as certain. Say what the signs are consistent with and what is still unclear.',
  'If the farmer describes sudden death, laboured breathing or gasping, paralysis or inability to stand, a twisted neck, swelling of the head or face, dark or blue comb, or a large share of the flock dying, do not give any home treatment. Tell the farmer plainly to contact a veterinarian immediately and stop there.',
  'Only record what the farmer actually stated. If a detail was not given, leave the field out. Never guess a number, and never round one up to look helpful.',
  'Symptoms are short phrases in the words the farmer used. Keep Pidgin wording as spoken; do not tidy it into formal English.',
  'Keep the reply short, warm and practical. A farmer reads this on a phone with one bar of signal.',
];

function languageRule(lang: ReplyLanguage): string {
  return lang === 'pidgin'
    ? 'Reply in Nigerian Pidgin, matching how the farmer is writing. Do not switch to formal English.'
    : 'Reply in plain English, matching how the farmer is writing.';
}

/**
 * The turn prompt. Split out so a test can assert the safety rules are actually
 * present: they are the reason this file is not a generic "call the model" wrapper.
 */
export function chatSystemPrompt(lang: ReplyLanguage): string {
  return [
    'You are a poultry advisory assistant for Nigerian semi-commercial farmers keeping 200 to 2,000 birds.',
    'You help one farmer with one problem at a time over WhatsApp.',
    '',
    languageRule(lang),
    'Fill the "delta" object with the case details this message adds. Leave a field out unless the farmer stated it in this conversation or an earlier turn recorded it.',
    'Set "wantsSupply" to true only when the farmer asks to buy or where to get treatment.',
    'Put things you could not confidently place in "needsConfirmation" as short questions for the farmer to answer.',
    'Set "profile.name" the first time the farmer gives you their name.',
    '',
    'Rules you must not break:',
    ...SAFETY_RULES.map((rule) => `- ${rule}`),
    '',
    'A greeting, a thank you, or a message with no health information is normal. Reply in a sentence or two and return an empty delta.',
    'Return only the JSON object described by the response schema.',
  ].join('\n');
}

/**
 * Compaction runs on dropped history, not on the current turn, and its output is
 * working memory for the model rather than text a farmer reads. It is therefore
 * written in English while quoting the farmer verbatim, which is what keeps a
 * Pidgin note useful to the next turn.
 */
export function compactSystemPrompt(): string {
  return [
    'You compress a poultry advisory conversation so it fits a small context budget without losing the case.',
    'Rules:',
    '- Write each note in English, one short sentence, at most 240 characters.',
    '- Keep quoted farmer wording verbatim, including Pidgin, so meaning survives.',
    '- Keep the facts that decide a door: species, symptoms, how long, how many died, farm size, and anything the farmer corrected.',
    '- Drop pleasantries, repeated statements and anything already superseded by a later fact.',
    `- Return at most the number of notes you are given, as a "notes" array of strings.`,
    'Return only the JSON object described by the response schema.',
  ].join('\n');
}

// ---------------------------------------------------------------- request shaping

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

// `candidates` is deliberately optional here. A request the model refuses returns
// a block reason and no candidates at all, so requiring candidates at parse time
// would report a safety block as a malformed response and lose the one fact that
// matters. The shape of each candidate is still checked, and presence is
// required separately once the block check has run.
const GenerateResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string() })) }),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z
    .object({ blockReason: z.string().optional() })
    .optional(),
});

/**
 * Gemini's `contents` roles are user/model, while the turn's history is
 * farmer/agent. Mapping them in one place keeps the vocabulary mismatch out of
 * every call site.
 */
const ROLE_TO_GEMINI: Readonly<Record<TurnMessage['role'], GeminiContent['role']>> = {
  farmer: 'user',
  agent: 'model',
};

function historyToContents(history: readonly TurnMessage[]): GeminiContent[] {
  return history.map((message) => ({
    role: ROLE_TO_GEMINI[message.role],
    parts: [{ text: message.text }],
  }));
}

/**
 * Gemini marks an absent field as `null` when it is not in `required`, and
 * `CaseDeltaSchema` accepts `undefined` but not `null`. Left alone that is a
 * guaranteed strict-parse failure and therefore a guaranteed fallback reply, so
 * nulls are dropped from object properties before the orchestrator sees them.
 * Nulls inside arrays are left in place: dropping those would change the list,
 * and a bad list should fail the parse and fall back.
 */
function dropNullProperties(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNullProperties);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null) continue;
    out[key] = dropNullProperties(entry);
  }
  return out;
}

function caseSummary(filled: unknown, missingFields: readonly string[]): string {
  return [
    'Case recorded so far:',
    JSON.stringify(filled),
    '',
    missingFields.length > 0
      ? `Still needed from the farmer: ${missingFields.join(', ')}`
      : 'The case has every required field.',
  ].join('\n');
}

export interface GeminiLlmOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
  temperature?: number;
}

class GeminiLlm {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #temperature: number;

  constructor(options: GeminiLlmOptions) {
    if (!options.apiKey) throw new LlmError('missing_api_key', 'GeminiLlm needs an apiKey');
    this.#apiKey = options.apiKey;
    this.#model = options.model ?? DEFAULT_CHAT_MODEL;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#temperature = options.temperature ?? DEFAULT_TEMPERATURE;
  }

  async json(request: {
    systemInstruction: string;
    contents: readonly GeminiContent[];
    responseSchema: Record<string, unknown>;
  }): Promise<unknown> {
    const url = `${this.#baseUrl}/models/${this.#model}:generateContent`;
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: 'POST',
        headers: { 'x-goog-api-key': this.#apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.systemInstruction }] },
          contents: request.contents,
          generationConfig: {
            temperature: this.#temperature,
            responseMimeType: 'application/json',
            responseSchema: request.responseSchema,
          },
        }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (cause) {
      // A timeout, a DNS failure and a dropped socket are all "the model did not
      // answer", and the orchestrator's stall path is the designed answer to that.
      // Re-thrown as LlmError so a caller cannot mistake a transport fault for
      // a contract violation.
      throw new LlmError('llm_unreachable', `the model was unreachable: ${String(cause)}`);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new LlmError(
        'llm_request_failed',
        `model request failed with ${response.status} ${response.statusText}: ${detail.slice(0, 300)}`,
      );
    }

    const parsed = GenerateResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new LlmError(
        'llm_bad_response',
        `model response did not match the contract: ${parsed.error.message}`,
      );
    }

    const blocked = parsed.data.promptFeedback?.blockReason;
    if (blocked !== undefined) {
      throw new LlmError('llm_blocked', `the request was blocked: ${blocked}`);
    }

    const candidate = parsed.data.candidates?.[0];
    if (candidate === undefined) {
      throw new LlmError('llm_no_candidates', 'the model returned no candidates');
    }

    const text = (candidate.content.parts ?? [])
      .map((part) => part.text)
      .join('')
      .trim();

    if (text.length === 0) {
      const reason = candidate?.finishReason;
      throw new LlmError(
        'llm_empty',
        reason === undefined
          ? 'the model returned no text'
          : `the model returned no text (finishReason: ${reason})`,
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      // Requested as JSON and still not JSON. Surfaced rather than swallowed so
      // the stall path records why, instead of every turn failing identically.
      throw new LlmError('llm_not_json', 'the model returned text that is not valid JSON');
    }

    return dropNullProperties(json);
  }
}

// ---------------------------------------------------------------- providers

export class GeminiChatProvider implements ChatProvider {
  readonly #llm: GeminiLlm;

  constructor(options: GeminiLlmOptions) {
    this.#llm = new GeminiLlm(options);
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

    return this.#llm.json({
      systemInstruction: `${chatSystemPrompt(input.replyLanguage)}\n\n${instruction}`,
      contents: [
        ...historyToContents(input.history),
        { role: 'user', parts: [{ text: input.query }] },
      ],
      responseSchema: LLM_REPLY_RESPONSE_SCHEMA,
    });
  }
}

export class GeminiCompactProvider implements CompactProvider {
  readonly #llm: GeminiLlm;

  constructor(options: GeminiLlmOptions) {
    this.#llm = new GeminiLlm(options);
  }

  async compact(input: CompactInput): Promise<unknown> {
    const transcript = input.dropped
      .map((message) => `${message.role}: ${message.text}`)
      .join('\n');

    const raw = await this.#llm.json({
      systemInstruction: compactSystemPrompt(),
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                `Existing notes (keep what is still true):\n${input.notes.join('\n') || '(none)'}`,
                '',
                `Dropped messages to compress:\n${transcript}`,
                '',
                `Return at most ${input.maxNotes} notes.`,
              ].join('\n'),
            },
          ],
        },
      ],
      responseSchema: LLM_COMPACT_RESPONSE_SCHEMA,
    });

    // Parsed here rather than left to the caller so a malformed fold is reported
    // as a compaction failure and the caller keeps the messages it already had.
    return CompactionResultSchema.parse(raw);
  }
}

// ---------------------------------------------------------------- credentials

export interface GeminiKeyInput {
  readonly nodeEnv: string;
  readonly devKey?: string;
  readonly prodKey?: string;
}

/**
 * Google rate-limits per project, not per key, so the dev loop and the product
 * need separate projects and a single key cannot serve both. Selection is
 * therefore strict rather than falling back: silently using the dev key in
 * production is the exact exhaustion this split exists to prevent.
 */
export function resolveGeminiApiKey(input: GeminiKeyInput): string {
  if (input.nodeEnv === 'production') {
    if (!input.prodKey) {
      throw new LlmError(
        'missing_api_key',
        'GEMINI_API_KEY_PROD is required when NODE_ENV=production; refusing to fall back to the dev project key',
      );
    }
    return input.prodKey;
  }
  if (!input.devKey) {
    throw new LlmError(
      'missing_api_key',
      'GEMINI_API_KEY is required outside production; refusing to use the product project key',
    );
  }
  return input.devKey;
}
