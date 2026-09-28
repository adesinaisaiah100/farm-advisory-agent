import { describe, expect, it } from 'vitest';
import { InboundMessageSchema } from '@poultry/schemas';
import { normalize, toInboundMessage, type NormalizeResult } from './normalize.js';
import {
  SELF_E164,
  SELF_JID,
  captionedPhoto,
  documentMessage,
  extendedTextReply,
  groupMessage,
  lidMessage,
  longFormTimestamp,
  messageWithoutId,
  ownOutboundMessage,
  pidginVoiceNote,
  revokedMessage,
  statusBroadcast,
  textMessage,
  videoMessage,
  voiceNoteMislabelledAsImage,
  voiceNoteWithGenericMime,
  whitespaceOnlyText,
} from './fixtures/wa-events.js';

const NOW = new Date('2026-09-28T00:00:00.000Z');
const OPTIONS = { selfJid: SELF_JID, now: NOW };
const FIXED_ID = '550e8400-e29b-41d4-a716-446655440000';
const STORED_URL = 'https://media.poultry.example/farm/2026-09-28/3EB0A1B2C3D4E5F60719.ogg';

function accepted(result: NormalizeResult) {
  if (!result.ok) throw new Error(`expected accepted, got ${result.reason}`);
  return result.value;
}

function rejected(result: NormalizeResult) {
  if (result.ok) throw new Error('expected rejected, got accepted');
  return result.reason;
}

describe('normalize text', () => {
  it('turns a direct text message into the shared contract', () => {
    const value = accepted(normalize(textMessage, OPTIONS));
    expect(value.from).toBe('+2348082974602');
    expect(value.to).toBe(SELF_E164);
    expect(value.text).toBe('Good morning, my birds are not eating');
    expect(value.waMsgId).toBe('3EB0A1B2C3D4E5F60718');
  });

  it('keeps Pidgin verbatim instead of correcting it to English', () => {
    const value = accepted(normalize(longFormTimestamp, OPTIONS));
    expect(value.text).toBe('dey no dey chop');
  });

  it('reads text out of an extendedTextMessage reply', () => {
    expect(accepted(normalize(extendedTextReply, OPTIONS)).text).toBe(
      'The one you asked about died overnight',
    );
  });

  it('stamps the WhatsApp send time rather than the time we processed it', () => {
    expect(accepted(normalize(textMessage, OPTIONS)).receivedAt).toBe(
      new Date(1789012345 * 1000).toISOString(),
    );
  });

  it('reads a long-form WhatsApp timestamp', () => {
    expect(accepted(normalize(longFormTimestamp, OPTIONS)).receivedAt).toBe(
      new Date(1789013240 * 1000).toISOString(),
    );
  });

  it('falls back to the injected clock when the event carries no usable timestamp', () => {
    const value = accepted(
      normalize({ key: textMessage.key, message: { conversation: 'hello' } }, OPTIONS),
    );
    expect(value.receivedAt).toBe(NOW.toISOString());
  });
});

describe('normalize media', () => {
  it('classifies a voice note as audio and drops the codec parameter', () => {
    const media = accepted(normalize(pidginVoiceNote, OPTIONS)).media;
    expect(media?.kind).toBe('audio');
    expect(media?.mime).toBe('audio/ogg');
  });

  it('keeps a voice note audio when WhatsApp reports a generic mime type', () => {
    const media = accepted(normalize(voiceNoteWithGenericMime, OPTIONS)).media;
    expect(media?.kind).toBe('audio');
    expect(media?.mime).toBe('audio/ogg');
  });

  it('trusts the message category over a mime type that claims a voice note is a photo', () => {
    const media = accepted(normalize(voiceNoteMislabelledAsImage, OPTIONS)).media;
    expect(media?.kind).toBe('audio');
    expect(media?.mime).toBe('audio/ogg');
  });

  it('keeps a photo caption as the farmer description alongside the photo', () => {
    const value = accepted(normalize(captionedPhoto, OPTIONS));
    expect(value.text).toBe('This one was shaking this morning');
    expect(value.media?.kind).toBe('image');
  });

  it('preserves a document mime type rather than relabelling it', () => {
    const media = accepted(normalize(documentMessage, OPTIONS)).media;
    expect(media?.kind).toBe('document');
    expect(media?.mime).toBe('application/pdf');
  });

  it('keeps a document mime type the media pipeline will refuse, so it fails honestly', () => {
    const message = {
      key: documentMessage.key,
      message: { documentMessage: { mimetype: 'text/plain' } },
    };
    expect(accepted(normalize(message, OPTIONS)).media?.mime).toBe('text/plain');
  });

  it('classifies a video by its own category', () => {
    const media = accepted(normalize(videoMessage, OPTIONS)).media;
    expect(media?.kind).toBe('video');
    expect(media?.mime).toBe('video/mp4');
  });

  it('carries the download handle the socket needs to fetch the bytes', () => {
    const media = accepted(normalize(pidginVoiceNote, OPTIONS)).media;
    expect(media?.directPath).toBe('/v/t62.7118-24/1234567890');
    expect(media?.fileLength).toBe(48123);
    expect(media?.mediaKey).toBeTruthy();
  });
});

describe('normalize rejects', () => {
  it('drops our own outbound message so the bridge cannot answer itself', () => {
    expect(rejected(normalize(ownOutboundMessage, OPTIONS))).toBe('own_message');
  });

  it('drops a group message, which names a group rather than a farmer', () => {
    expect(rejected(normalize(groupMessage, OPTIONS))).toBe('not_a_direct_chat');
  });

  it('drops a message whose remote JID is a group, even without a participant', () => {
    const message = {
      key: { id: 'x', remoteJid: '120363000000000000@g.us' },
      message: textMessage.message,
    };
    expect(rejected(normalize(message, OPTIONS))).toBe('not_a_direct_chat');
  });

  it('drops a privacy-identifier JID, which is not a phone number', () => {
    expect(rejected(normalize(lidMessage, OPTIONS))).toBe('not_a_direct_chat');
  });

  it('drops a status broadcast', () => {
    expect(rejected(normalize(statusBroadcast, OPTIONS))).toBe('not_a_direct_chat');
  });

  it('drops an event with no message id to deduplicate on', () => {
    expect(rejected(normalize(messageWithoutId, OPTIONS))).toBe('no_message_id');
  });

  it('drops a revoked message', () => {
    expect(rejected(normalize(revokedMessage, OPTIONS))).toBe('no_content');
  });

  it('drops a whitespace-only message rather than answering an empty turn', () => {
    expect(rejected(normalize(whitespaceOnlyText, OPTIONS))).toBe('no_content');
  });
});

describe('toInboundMessage', () => {
  it('produces a message the shared contract accepts', () => {
    const value = accepted(normalize(textMessage, OPTIONS));
    const inbound = toInboundMessage(value, { id: FIXED_ID });
    expect(InboundMessageSchema.safeParse(inbound).success).toBe(true);
    expect(inbound.id).toBe(FIXED_ID);
  });

  it('attaches the stored url to media that was already uploaded', () => {
    const value = accepted(normalize(pidginVoiceNote, OPTIONS));
    const inbound = toInboundMessage(value, { id: FIXED_ID, mediaUrl: STORED_URL });
    expect(inbound.media).toEqual({ url: STORED_URL, kind: 'audio', mime: 'audio/ogg' });
  });

  it('refuses to invent a media url the core would later fail to fetch', () => {
    const value = accepted(normalize(pidginVoiceNote, OPTIONS));
    expect(() => toInboundMessage(value, { id: FIXED_ID })).toThrow(/refusing to invent/);
  });

  it('rejects a sender that is not a phone number, the gap the deleted local schema left open', () => {
    const value = { ...accepted(normalize(textMessage, OPTIONS)), from: 'not-a-phone' };
    expect(() => toInboundMessage(value, { id: FIXED_ID })).toThrow();
  });
});
