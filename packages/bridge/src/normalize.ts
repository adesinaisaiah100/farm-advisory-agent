import {
  InboundMessageSchema,
  normalizePhone,
  type InboundMessage,
  type MediaKind,
} from '@poultry/schemas';

export interface RawMediaContent {
  mimetype?: string | undefined;
  url?: string | undefined;
  directPath?: string | undefined;
  mediaKey?: string | undefined;
  fileLength?: number | undefined;
  fileName?: string | undefined;
  caption?: string | undefined;
}

export interface RawWaMessage {
  key?:
    | {
        id?: string | undefined;
        remoteJid?: string | undefined;
        fromMe?: boolean | undefined;
        participant?: string | undefined;
        senderPn?: string | undefined;
      }
    | undefined;
  message?:
    | {
        conversation?: string | undefined;
        extendedTextMessage?: { text?: string | undefined } | undefined;
        imageMessage?: RawMediaContent | undefined;
        audioMessage?: RawMediaContent | undefined;
        videoMessage?: RawMediaContent | undefined;
        documentMessage?: RawMediaContent | undefined;
        stickerMessage?: RawMediaContent | undefined;
        [key: string]: unknown;
      }
    | undefined;
  messageTimestamp?: number | { low?: number | undefined } | undefined;
}

export interface NormalizedMedia {
  readonly kind: MediaKind;
  readonly mime: string;
  readonly directPath?: string | undefined;
  readonly mediaKey?: string | undefined;
  readonly fileLength?: number | undefined;
}

export interface NormalizedInbound {
  readonly waMsgId: string;
  readonly from: string;
  readonly to: string;
  readonly text?: string | undefined;
  readonly media?: NormalizedMedia | undefined;
  readonly receivedAt: string;
}

export type NormalizeRejection =
  'own_message' | 'not_a_direct_chat' | 'no_message_id' | 'unroutable_phone' | 'no_content';

export type NormalizeResult =
  | { readonly ok: true; readonly value: NormalizedInbound }
  | { readonly ok: false; readonly reason: NormalizeRejection };

const USER_JID_SUFFIX = '@s.whatsapp.net';

type MediaField =
  'imageMessage' | 'audioMessage' | 'videoMessage' | 'documentMessage' | 'stickerMessage';

const MEDIA_CATEGORY_TO_KIND: ReadonlyArray<readonly [MediaField, MediaKind]> = [
  ['audioMessage', 'audio'],
  ['imageMessage', 'image'],
  ['videoMessage', 'video'],
  ['documentMessage', 'document'],
  ['stickerMessage', 'image'],
];

const KIND_MIME_PREFIX: Partial<Record<MediaKind, string>> = {
  audio: 'audio/',
  image: 'image/',
  video: 'video/',
};

const KIND_FALLBACK_MIME: Partial<Record<MediaKind, string>> = {
  audio: 'audio/ogg',
  image: 'image/jpeg',
  video: 'video/mp4',
};

const GENERIC_MIME = 'application/octet-stream';

function cleanMime(mime: string | undefined): string | undefined {
  const head = mime?.split(';')[0]?.trim().toLowerCase();
  return head ? head : undefined;
}

/**
 * WhatsApp states the message category in a dedicated field and states the media type separately, and the
 * two disagree in the wild. The category is the one the transport observed, so it wins. This matters beyond
 * tidiness: `@poultry/media` derives its kind from the mime and only transcribes audio. A voice note carrying
 * `image/jpeg` would be filed as a photo, skip transcription, and reach the farmer as a confident answer to
 * a question they never asked in words.
 */
function resolveMime(kind: MediaKind, declared: string | undefined): string {
  const mime = cleanMime(declared);
  if (kind === 'document') return mime ?? GENERIC_MIME;
  const prefix = KIND_MIME_PREFIX[kind];
  if (mime && prefix && mime.startsWith(prefix)) return mime;
  return mime && !prefix ? mime : (KIND_FALLBACK_MIME[kind] ?? GENERIC_MIME);
}

function toE164(jid: string | undefined): string | null {
  if (!jid) return null;
  const at = jid.indexOf('@');
  if (at === -1) return normalizePhone(jid);
  const user = jid.slice(0, at).split(':')[0]!;
  if (jid.slice(at) !== USER_JID_SUFFIX) return null;
  if (!/^\d+$/.test(user)) return null;
  return normalizePhone(user);
}

function toIso(timestamp: RawWaMessage['messageTimestamp'], now: Date): string {
  const seconds =
    typeof timestamp === 'number'
      ? timestamp
      : typeof timestamp?.low === 'number'
        ? timestamp.low
        : Number.NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return now.toISOString();
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? now.toISOString() : date.toISOString();
}

function extractText(message: NonNullable<RawWaMessage['message']>): string | undefined {
  const candidates = [
    message.conversation,
    message.extendedTextMessage?.text,
    message.imageMessage?.caption,
    message.videoMessage?.caption,
    message.documentMessage?.caption,
  ];
  for (const candidate of candidates) {
    const text = candidate?.trim();
    if (text) return text;
  }
  return undefined;
}

function extractMedia(message: NonNullable<RawWaMessage['message']>): NormalizedMedia | undefined {
  for (const [field, kind] of MEDIA_CATEGORY_TO_KIND) {
    const content = message[field];
    if (!content) continue;
    return {
      kind,
      mime: resolveMime(kind, content.mimetype),
      directPath: content.directPath,
      mediaKey: content.mediaKey,
      fileLength: content.fileLength,
    };
  }
  return undefined;
}

function unwrapMessage(msg: NonNullable<RawWaMessage['message']>): NonNullable<RawWaMessage['message']> {
  let current: any = msg;
  for (let i = 0; i < 5; i++) {
    if (!current || typeof current !== 'object') break;
    const inner =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message ||
      current.documentWithCaptionMessage?.message ||
      current.editedMessage?.message?.protocolMessage?.editedMessage;
    if (!inner) break;
    current = inner;
  }
  return (current && typeof current === 'object' ? current : msg) as NonNullable<RawWaMessage['message']>;
}

export interface NormalizeOptions {
  readonly selfJid: string;
  readonly now: Date;
}

/**
 * Every rejection here is an expected occurrence, not a failure: our own outbound messages, group chats,
 * status and revoked entries all arrive on the same stream as real farmer messages. Reporting them as a
 * result rather than throwing keeps the socket loop free of control flow for conditions it will hit daily.
 */
export function normalize(raw: RawWaMessage, options: NormalizeOptions): NormalizeResult {
  if (raw.key?.fromMe === true) return { ok: false, reason: 'own_message' };
  if (raw.key?.participant !== undefined) return { ok: false, reason: 'not_a_direct_chat' };

  const waMsgId = raw.key?.id?.trim();
  if (!waMsgId) return { ok: false, reason: 'no_message_id' };

  const from = toE164(raw.key?.senderPn ?? raw.key?.remoteJid);
  if (!from)
    return { ok: false, reason: raw.key?.remoteJid ? 'not_a_direct_chat' : 'unroutable_phone' };

  const to = toE164(options.selfJid);
  if (!to) return { ok: false, reason: 'unroutable_phone' };

  const message = raw.message;
  if (!message) return { ok: false, reason: 'no_content' };

  const unwrapped = unwrapMessage(message);
  const text = extractText(unwrapped);
  const media = extractMedia(unwrapped);
  if (!text && !media) return { ok: false, reason: 'no_content' };

  return {
    ok: true,
    value: { waMsgId, from, to, text, media, receivedAt: toIso(raw.messageTimestamp, options.now) },
  };
}

export interface ToInboundOptions {
  readonly id: string;
  readonly mediaUrl?: string | undefined;
}

/**
 * Split from `normalize` because the shared contract needs an `https` url for media, and the only honest
 * source of that url is an object store the bytes were just uploaded to. Producing it here would mean
 * inventing a link the core would then fetch and fail on.
 */
export function toInboundMessage(
  normalized: NormalizedInbound,
  options: ToInboundOptions,
): InboundMessage {
  if (normalized.media && !options.mediaUrl) {
    throw new Error('media was normalised but no stored url was supplied; refusing to invent one');
  }

  return InboundMessageSchema.parse({
    id: options.id,
    from: normalized.from,
    to: normalized.to,
    text: normalized.text,
    media: normalized.media
      ? {
          url: options.mediaUrl as string,
          kind: normalized.media.kind,
          mime: normalized.media.mime,
        }
      : undefined,
    receivedAt: normalized.receivedAt,
  });
}
