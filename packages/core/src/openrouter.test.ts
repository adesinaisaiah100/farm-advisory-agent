import { describe, expect, it, vi } from 'vitest';
import { OpenRouterChatProvider } from './openrouter.js';
import type { ChatInput } from './providers.js';

const DUMMY_INPUT: ChatInput = {
  filled: { status: 'in_progress', species: 'broiler', symptoms: ['sneezing'] },
  missing: [],
  notes: [],
  query: 'Hello',
  history: [],
  replyLanguage: 'english',
};

describe('OpenRouterChatProvider', () => {
  it('throws missing_api_key when apiKey is empty', () => {
    expect(() => new OpenRouterChatProvider({ apiKey: '' })).toThrow(/needs an apiKey/);
  });

  it('successfully parses OpenAI-compatible completion JSON', async () => {
    const mockPayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              reply: 'Hello farmer!',
              delta: { species: 'broiler' },
            }),
          },
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockPayload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const provider = new OpenRouterChatProvider({
      apiKey: 'test-key',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const result = await provider.complete(DUMMY_INPUT);
    expect(result).toEqual({
      reply: 'Hello farmer!',
      delta: { species: 'broiler' },
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws on non-200 HTTP response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('Rate limit exceeded', { status: 429, statusText: 'Too Many Requests' }),
    );

    const provider = new OpenRouterChatProvider({
      apiKey: 'test-key',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    await expect(provider.complete(DUMMY_INPUT)).rejects.toThrow(/OpenRouter request failed/);
  });
});
