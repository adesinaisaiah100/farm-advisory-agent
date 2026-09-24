import { describe, expect, it } from 'vitest';
import { InboundMessageSchema, MessageSchema, normalizeMessage } from './index.js';

const ID = '9d47f8cd-4b6f-4f1a-8a6b-9ae1aef9b701';
const WHEN = '2026-09-24T10:00:00.000Z';

describe('InboundMessageSchema', () => {
  it('accepts a text message', () => {
    const msg = {
      id: ID,
      from: '08012345678',
      to: '+2348011112222',
      text: 'wetin na my fowl dey shake?',
      receivedAt: WHEN,
    };
    expect(InboundMessageSchema.safeParse(msg).success).toBe(true);
  });

  it('accepts a voice-note message', () => {
    const msg = {
      id: ID,
      from: '+2348112233445',
      to: '+2348011112222',
      media: {
        url: 'https://r2.example.com/voice/note.m4a',
        kind: 'audio',
        mime: 'audio/mp4',
      },
      receivedAt: WHEN,
    };
    expect(InboundMessageSchema.safeParse(msg).success).toBe(true);
  });

  it('rejects a message carrying neither text nor media', () => {
    expect(
      InboundMessageSchema.safeParse({
        id: ID,
        from: '+2348112233445',
        to: '+2348011112222',
        receivedAt: WHEN,
      }).success,
    ).toBe(false);
  });

  it('rejects a message with an empty text field', () => {
    expect(
      InboundMessageSchema.safeParse({
        id: ID,
        from: '+2348112233445',
        to: '+2348011112222',
        text: '',
        receivedAt: WHEN,
      }).success,
    ).toBe(false);
  });
});

describe('normalizeMessage', () => {
  it('normalizes both endpoints to E.164', () => {
    const msg = {
      id: ID,
      from: '08012345678',
      to: '2348112233445',
      text: 'hello',
      receivedAt: WHEN,
    };
    const out = normalizeMessage(msg);
    expect(out.from).toBe('+2348012345678');
    expect(out.to).toBe('+2348112233445');
  });
});

describe('MessageSchema', () => {
  it('accepts a stored message row', () => {
    const row = {
      id: ID,
      sessionId: ID,
      sender: 'farmer',
      payload: 'hello o',
      sentAt: WHEN,
    };
    expect(MessageSchema.safeParse(row).success).toBe(true);
  });

  it('rejects an unknown sender', () => {
    expect(
      MessageSchema.safeParse({
        id: ID,
        sessionId: ID,
        sender: 'vet',
        payload: 'hello',
        sentAt: WHEN,
      }).success,
    ).toBe(false);
  });
});