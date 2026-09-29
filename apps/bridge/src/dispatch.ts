import type { InboundMessage } from '@poultry/schemas';
import {
  Deduplicator,
  isFarmerAllowed,
  normalize,
  toInboundMessage,
  type NormalizedMedia,
  type RawWaMessage,
} from '@poultry/bridge';

export interface Clock {
  now(): Date;
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface DownloadedMedia {
  readonly bytes: Uint8Array;
  readonly mime: string;
}

/**
 * The only honest way to get media out of WhatsApp is through the authenticated socket, so downloading is
 * the bridge's job. Turning those bytes into a `url` the core can read is `@poultry/media`'s job, which is
 * why this is a port: Phase 6's R2 pipeline plugs in here rather than the bridge reimplementing storage.
 */
export interface StoredMediaResult {
  readonly mediaUrl: string;
  readonly text?: string;
  readonly confirmQuestion?: string;
}

export interface MediaIntake {
  store(input: {
    bytes: Uint8Array;
    mime: string;
    phone: string;
    media: NormalizedMedia;
  }): Promise<string | StoredMediaResult>;
}

export interface TurnHandler {
  /** `null` means the turn produced nothing a farmer should receive. */
  handle(message: InboundMessage): Promise<string | null>;
}

export type DispatchOutcome =
  | { readonly outcome: 'replied'; readonly waMsgId: string; readonly reply: string }
  | { readonly outcome: 'accepted_no_reply'; readonly waMsgId: string }
  | { readonly outcome: 'ignored'; readonly reason: string }
  | { readonly outcome: 'not_allowed'; readonly waMsgId: string }
  | { readonly outcome: 'duplicate'; readonly waMsgId: string }
  | { readonly outcome: 'failed'; readonly waMsgId: string; readonly reason: string };

export interface DispatchDeps {
  readonly dedup: Deduplicator;
  readonly allowed: readonly string[];
  readonly selfJid: string;
  readonly clock: Clock;
  readonly download: (raw: RawWaMessage, media: NormalizedMedia) => Promise<DownloadedMedia | null>;
  readonly mediaIntake: MediaIntake;
  readonly turn: TurnHandler;
  readonly log: Logger;
}

export async function dispatch(raw: RawWaMessage, deps: DispatchDeps): Promise<DispatchOutcome> {
  const now = deps.clock.now();
  const normalized = normalize(raw, { selfJid: deps.selfJid, now });
  if (!normalized.ok) return { outcome: 'ignored', reason: normalized.reason };

  const inbound = normalized.value;
  if (!isFarmerAllowed(inbound.from, deps.allowed)) {
    return { outcome: 'not_allowed', waMsgId: inbound.waMsgId };
  }

  const claim = await deps.dedup.accept(inbound.waMsgId, now);
  if (!claim.accepted) return { outcome: 'duplicate', waMsgId: inbound.waMsgId };

  let mediaUrl: string | undefined;
  let mediaText: string | undefined;
  let confirmQuestion: string | undefined;

  if (inbound.media) {
    const downloaded = await deps.download(raw, inbound.media);
    if (!downloaded) {
      return { outcome: 'failed', waMsgId: inbound.waMsgId, reason: 'media_download_failed' };
    }
    try {
      const stored = await deps.mediaIntake.store({
        bytes: downloaded.bytes,
        mime: downloaded.mime,
        phone: inbound.from,
        media: inbound.media,
      });
      if (typeof stored === 'string') {
        mediaUrl = stored;
      } else {
        mediaUrl = stored.mediaUrl;
        mediaText = stored.text;
        confirmQuestion = stored.confirmQuestion;
      }
    } catch (error) {
      deps.log.error('media intake failed', { waMsgId: inbound.waMsgId, error: String(error) });
      return { outcome: 'failed', waMsgId: inbound.waMsgId, reason: 'media_intake_failed' };
    }
  }

  if (confirmQuestion) {
    return { outcome: 'replied', waMsgId: inbound.waMsgId, reply: confirmQuestion };
  }

  const combinedText = [inbound.text, mediaText].filter(Boolean).join('\n');
  const enrichedInbound = { ...inbound, text: combinedText.length > 0 ? combinedText : undefined };

  let message: InboundMessage;
  try {
    message = toInboundMessage(enrichedInbound, { id: crypto.randomUUID(), mediaUrl });
  } catch (error) {
    deps.log.error('rejected an inbound message that failed the shared contract', {
      waMsgId: inbound.waMsgId,
      error: String(error),
    });
    return { outcome: 'failed', waMsgId: inbound.waMsgId, reason: 'contract_rejected' };
  }

  let reply: string | null;
  try {
    reply = await deps.turn.handle(message);
  } catch (error) {
    deps.log.error('turn failed', { waMsgId: inbound.waMsgId, error: String(error) });
    return { outcome: 'failed', waMsgId: inbound.waMsgId, reason: 'turn_failed' };
  }

  if (reply === null) return { outcome: 'accepted_no_reply', waMsgId: inbound.waMsgId };
  return { outcome: 'replied', waMsgId: inbound.waMsgId, reply };
}
