import { MediaSchema, type Media, type MediaKind } from '@poultry/schemas';
import { normalizePhone } from '@poultry/schemas';
import { isReliable } from '@poultry/schemas';
import { MediaError, mediaKey } from './key.js';
import type { MediaStore } from './store.js';
import type { Transcriber } from './transcribe.js';
import type { VisionProvider } from './vision.js';

const KIND_BY_MIME_PREFIX: ReadonlyArray<readonly [string, MediaKind]> = [
  ['audio/', 'audio'],
  ['image/', 'image'],
  ['video/', 'video'],
  ['application/pdf', 'document'],
];

export function kindFor(mime: string): MediaKind {
  const normalised = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  for (const [prefix, kind] of KIND_BY_MIME_PREFIX) {
    if (normalised.startsWith(prefix)) return kind;
  }
  throw new MediaError(
    'unsupported_mime',
    `cannot decide a media kind for "${normalised}"; refusing to guess one`,
  );
}

export type ConfirmationReason = 'no_confidence' | 'low_confidence';

export type MediaIngestResult =
  | { readonly kind: 'ready'; readonly media: Media }
  | {
      readonly kind: 'needs_confirmation';
      readonly media: Media;
      readonly reason: ConfirmationReason;
      /** Default English wording. The reply layer owns localisation. */
      readonly question: string;
    };

export interface IngestDeps {
  store: MediaStore;
  transcriber?: Transcriber;
  vision?: VisionProvider;
  /** Injected so tests never read the wall clock. */
  now: () => Date;
  /** Injected so tests never use Math.random. */
  newId: () => string;
}

export interface IngestInput {
  phone: string;
  mime: string;
  body: Uint8Array;
  caseId?: string;
}

function defaultQuestion(transcript: string | undefined): string {
  if (transcript === undefined || transcript.length === 0) {
    return "I could not hear that clearly enough. Could you type what is happening with your birds?";
  }
  return `I heard: "${transcript}". Is that right? Please confirm or retype it.`;
}

function confirmationFor(media: Media): MediaIngestResult {
  const reason: ConfirmationReason = media.transcriptConfidence === undefined
    ? 'no_confidence'
    : 'low_confidence';
  return {
    kind: 'needs_confirmation',
    media,
    reason,
    question: defaultQuestion(media.transcript),
  };
}

/**
 * Upload, then derive whatever the media can support.
 *
 * The returned `kind` is the gate: `needs_confirmation` means the transcript
 * must not be treated as a farmer statement until the farmer confirms it. A
 * missing confidence score is not a pass — `gemini-3.5-transcribe` does not
 * return one, so every real voice note lands here until a provider that reports
 * confidence is wired in. That is the honest reading of the contract, and it is
 * why the threshold lives in `@poultry/schemas` as "absent means unreliable".
 *
 * The kind is derived from the mime type and cannot be supplied by the caller.
 * The mime arrives from WhatsApp, so a caller that could assert a kind could
 * relabel a voice note as a photo, which would skip transcription and the
 * confirmation gate entirely and store a statement the farmer never made.
 *
 * The bytes handed to the store are the bytes that get read back, so nothing is
 * downloaded from R2 again on this path; the store is written once and the
 * in-memory buffer is the source of truth for the derived record.
 */
export async function ingestMedia(
  deps: IngestDeps,
  input: IngestInput,
): Promise<MediaIngestResult> {
  const phone = normalizePhone(input.phone);
  const kind = kindFor(input.mime);
  const id = deps.newId();
  const uploadedAt = deps.now();
  const key = mediaKey({ phone, date: uploadedAt, id, mime: input.mime });

  await deps.store.put(key, input.body, input.mime);

  const base = {
    id,
    farmerPhone: phone,
    mime: input.mime,
    r2Key: key,
    kind,
    uploadedAt: uploadedAt.toISOString(),
    ...(input.caseId === undefined ? {} : { caseId: input.caseId }),
  };

  if (kind === 'audio') {
    if (deps.transcriber === undefined) {
      throw new MediaError('missing_transcriber', 'audio media needs a transcriber');
    }
    let transcriptText = '';
    let confidence: number | undefined;
    try {
      const transcript = await deps.transcriber.transcribe({
        audio: input.body,
        mime: input.mime,
      });
      transcriptText = transcript.text;
      confidence = transcript.confidence;
    } catch (err) {
      if (err instanceof MediaError && (err.code === 'transcribe_empty' || err.code === 'transcribe_bad_response')) {
        const media = MediaSchema.parse({ ...base, transcript: '' });
        return confirmationFor(media);
      }
      throw err;
    }
    const media = MediaSchema.parse({
      ...base,
      transcript: transcriptText,
      ...(confidence === undefined ? {} : { transcriptConfidence: confidence }),
    });
    return isReliable(media.transcriptConfidence) ? { kind: 'ready', media } : confirmationFor(media);
  }

  if (kind === 'image') {
    if (deps.vision === undefined) {
      throw new MediaError('missing_vision', 'image media needs a vision provider');
    }
    const { observations } = await deps.vision.observe({
      image: input.body,
      mime: input.mime,
    });
    // Observations are descriptions, not statements by the farmer, so there is
    // nothing for the farmer to confirm. The confidence gate is audio-only.
    return { kind: 'ready', media: MediaSchema.parse({ ...base, observations }) };
  }

  // video and document are stored for a later phase and are not read here.
  return { kind: 'ready', media: MediaSchema.parse(base) };
}
