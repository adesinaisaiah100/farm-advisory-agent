import { z } from 'zod';

/**
 * Extension per MIME type. An explicit allowlist, because the extension is what
 * a human or a downstream tool reads when the file is fetched: a wrong or
 * default extension is how a `.jpg` of an audio note ends up being opened as an
 * image. An unmapped type is rejected rather than guessed at.
 */
const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'audio/aac': 'aac',
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/webm': 'weba',
  'audio/x-wav': 'wav',
  'audio/wav': 'wav',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'application/pdf': 'pdf',
};

export const SUPPORTED_MIME_TYPES = Object.keys(EXTENSION_BY_MIME).sort();

export class MediaError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MediaError';
    this.code = code;
  }
}

export function extensionFor(mime: string): string {
  // WhatsApp and browsers disagree about casing and about `; codecs=` suffixes.
  const normalised = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  const extension = EXTENSION_BY_MIME[normalised];
  if (extension === undefined) {
    throw new MediaError(
      'unsupported_mime',
      `no extension mapping for mime type "${normalised}"; refusing to guess one`,
    );
  }
  return extension;
}

/**
 * The object key: `media/{phone}/{yyyy-mm-dd}/{uuid}.{ext}`.
 *
 * The phone segment is the E.164 number with every non-digit removed, so
 * `+2348082974602` becomes `2348082974602`. The `+` is legal in an R2 key but
 * not safe to put in a URL path segment, where it can decode as a space.
 */
export function mediaKey(input: {
  phone: string;
  date: Date;
  id: string;
  mime: string;
}): string {
  const digits = input.phone.replace(/\D/g, '');
  if (digits.length === 0) {
    throw new MediaError('invalid_phone', `phone "${input.phone}" has no digits`);
  }
  // `toISOString` throws a bare RangeError on an Invalid Date, and the clock is
  // injected by the caller, so a broken clock gets a named error here instead.
  if (Number.isNaN(input.date.getTime())) {
    throw new MediaError('invalid_date', 'date is not a valid Date');
  }
  const day = input.date.toISOString().slice(0, 10);
  return `media/${digits}/${day}/${input.id}.${extensionFor(input.mime)}`;
}

export const MediaKeySchema = z
  .string()
  .regex(
    /^media\/\d{10,15}\/\d{4}-\d{2}-\d{2}\/[0-9a-fA-F-]{36}\.[a-z0-9]+$/,
    'expected media/{phone}/{yyyy-mm-dd}/{uuid}.{ext}',
  );
