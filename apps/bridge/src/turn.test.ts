import { describe, expect, it, vi } from 'vitest';
import type { InboundMessage } from '@poultry/schemas';
import { createHttpTurnHandler } from './turn.js';
import type { Logger } from './dispatch.js';

const SAMPLE_MESSAGE: InboundMessage = {
  id: '00000000-0000-4000-8000-000000000001',
  from: '+2348082974602',
  to: '+2348000000000',
  text: 'my birds dey sneeze',
  receivedAt: '2026-09-28T10:00:00.000Z',
};

const silentLog: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe('createHttpTurnHandler', () => {
  it('posts farmerPhone and text to the configured URL', async () => {
    let capturedUrl = '';
    let capturedBody = '';

    const mockFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedBody = init.body as string;
      return new Response(JSON.stringify({ reply: 'wetin dey happen to di birds?' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const handler = createHttpTurnHandler({
      url: 'http://127.0.0.1:3000/chat',
      fetch: mockFetch,
      log: silentLog,
    });

    const reply = await handler.handle(SAMPLE_MESSAGE);

    expect(capturedUrl).toBe('http://127.0.0.1:3000/chat');
    expect(JSON.parse(capturedBody)).toEqual({
      farmerPhone: '+2348082974602',
      text: 'my birds dey sneeze',
    });
    expect(reply).toBe('wetin dey happen to di birds?');
  });

  it('returns null when inbound message has no text', async () => {
    const mockFetch = vi.fn();
    const handler = createHttpTurnHandler({
      url: 'http://127.0.0.1:3000/chat',
      fetch: mockFetch,
    });

    const reply = await handler.handle({ ...SAMPLE_MESSAGE, text: undefined });

    expect(reply).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null and logs error when API responds with 500', async () => {
    let loggedError = false;
    const mockLog: Logger = {
      ...silentLog,
      error: () => {
        loggedError = true;
      },
    };

    const mockFetch = vi.fn().mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    );

    const handler = createHttpTurnHandler({
      url: 'http://127.0.0.1:3000/chat',
      fetch: mockFetch,
      log: mockLog,
    });

    const reply = await handler.handle(SAMPLE_MESSAGE);

    expect(reply).toBeNull();
    expect(loggedError).toBe(true);
  });

  it('returns null when network throws an error', async () => {
    let loggedError = false;
    const mockLog: Logger = {
      ...silentLog,
      error: () => {
        loggedError = true;
      },
    };

    const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const handler = createHttpTurnHandler({
      url: 'http://127.0.0.1:3000/chat',
      fetch: mockFetch,
      log: mockLog,
    });

    const reply = await handler.handle(SAMPLE_MESSAGE);

    expect(reply).toBeNull();
    expect(loggedError).toBe(true);
  });
});
