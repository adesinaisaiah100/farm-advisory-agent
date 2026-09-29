import { z } from 'zod';
import { toBase64 } from './base64.js';
import { MediaError } from './key.js';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';

/**
 * `gemini-3.5-transcribe` does not answer with a normal text part. It returns the
 * transcript under `audioTranscription.text` inside the part, verified against
 * the live API. A general-purpose multimodal model answers with a plain `text`
 * part instead, so both are accepted rather than one being assumed.
 */
const PartSchema = z.union([
  z.object({ text: z.string() }).transform((part) => part.text),
  z.object({ audioTranscription: z.object({ text: z.string() }) }).transform(
    (part) => part.audioTranscription.text,
  ),
]);

const GenerateResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(PartSchema).optional(),
          })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .min(1, 'response carried no candidates'),
  promptFeedback: z
    .object({
      blockReason: z.string().optional(),
    })
    .optional(),
});

export const TranscriptSchema = z.object({
  text: z.string(),
  /**
   * Deliberately optional. `gemini-3.5-transcribe` returns no per-utterance
   * confidence, and inventing one would turn the farmer-confirmation gate into
   * decoration. Absent confidence is treated as unreliable by `isReliable`, so
   * a real Gemini transcript always asks the farmer to confirm.
   */
  confidence: z.number().min(0).max(1).optional(),
  language: z.string().optional(),
});

export type Transcript = z.infer<typeof TranscriptSchema>;

export interface Transcriber {
  transcribe(input: { audio: Uint8Array; mime: string }): Promise<Transcript>;
}

export interface GeminiTranscriberOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

/**
 * The dynamic part of the prompt. Built per call rather than a constant so a
 * future language hint ("pijin" / "english") can be threaded through without
 * touching the HTTP call, and so the rule that matters is visible in one place:
 * reproduce the speech, do not improve it.
 */
export function transcribePrompt(languageHint?: string): string {
  const language = languageHint ?? 'Nigerian Pidgin or English, whichever is spoken';
  return [
    'Transcribe the speech in this audio recording verbatim.',
    `The speaker is writing in ${language}.`,
    'Rules:',
    '- Write exactly what was said, including Pidgin wording, grammar and slang.',
    '- Never translate into formal English and never tidy up the grammar.',
    '- Do not answer, summarise, diagnose or comment on the content.',
    '- If speech is unintelligible, write [inaudible] where you cannot tell.',
    '- Do not add speaker labels, timestamps or punctuation that was not spoken.',
    'Return only the transcript text.',
  ].join('\n');
}

export class GeminiTranscriber implements Transcriber {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;

  constructor(options: GeminiTranscriberOptions) {
    if (!options.apiKey) throw new MediaError('missing_api_key', 'GeminiTranscriber needs an apiKey');
    this.#apiKey = options.apiKey;
    this.#model = options.model ?? DEFAULT_TRANSCRIBE_MODEL;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  async transcribe(input: { audio: Uint8Array; mime: string }): Promise<Transcript> {
    if (input.audio.byteLength === 0) {
      throw new MediaError('empty_audio', 'refusing to transcribe an empty audio body');
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
              { text: transcribePrompt() },
              {
                inlineData: {
                  mimeType: input.mime,
                  data: toBase64(input.audio),
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new MediaError(
        'transcribe_failed',
        `transcription request failed with ${response.status} ${response.statusText}: ${detail.slice(0, 300)}`,
      );
    }

    const parsed = GenerateResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new MediaError(
        'transcribe_bad_response',
        `transcription response did not match the contract: ${parsed.error.message}`,
      );
    }

    const candidate = parsed.data.candidates?.[0];
    const text = (candidate?.content?.parts ?? []).join('').trim();

    if (text.length === 0) {
      // An empty transcript is not a confident "nothing was said". It is a
      // failure to understand, and the caller must confirm with the farmer.
      const reason = candidate?.finishReason ?? parsed.data.promptFeedback?.blockReason;
      throw new MediaError(
        'transcribe_empty',
        reason === undefined
          ? 'the model returned no transcript text'
          : `the model returned no transcript text (finishReason: ${reason})`,
      );
    }

    return TranscriptSchema.parse({ text });
  }
}
