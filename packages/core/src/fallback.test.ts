import { describe, expect, it, vi } from 'vitest';
import { FallbackChatProvider } from './fallback.js';
import type { ChatProvider, ChatInput } from './providers.js';

const DUMMY_INPUT: ChatInput = {
  filled: { status: 'in_progress', species: 'broiler', symptoms: ['sneezing'] },
  missing: [],
  notes: [],
  query: 'Hello',
  history: [],
  replyLanguage: 'english',
};

describe('FallbackChatProvider', () => {
  it('returns primary result when primary succeeds without calling secondary', async () => {
    const primaryComplete = vi.fn().mockResolvedValue({ reply: 'primary response', delta: {} });
    const secondaryComplete = vi.fn().mockResolvedValue({ reply: 'secondary response', delta: {} });

    const primary: ChatProvider = { complete: primaryComplete };
    const secondary: ChatProvider = { complete: secondaryComplete };

    const provider = new FallbackChatProvider({ primary, secondary });
    const result = await provider.complete(DUMMY_INPUT);

    expect(result).toEqual({ reply: 'primary response', delta: {} });
    expect(primaryComplete).toHaveBeenCalledTimes(1);
    expect(secondaryComplete).not.toHaveBeenCalled();
  });

  it('falls back to secondary when primary throws', async () => {
    const primaryComplete = vi.fn().mockRejectedValue(new Error('503 Service Unavailable'));
    const secondaryComplete = vi.fn().mockResolvedValue({ reply: 'openrouter fallback', delta: {} });
    const logSpy = vi.fn();

    const primary: ChatProvider = { complete: primaryComplete };
    const secondary: ChatProvider = { complete: secondaryComplete };

    const provider = new FallbackChatProvider({ primary, secondary, log: logSpy });
    const result = await provider.complete(DUMMY_INPUT);

    expect(result).toEqual({ reply: 'openrouter fallback', delta: {} });
    expect(primaryComplete).toHaveBeenCalledTimes(1);
    expect(secondaryComplete).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('primary chat provider failed'),
      expect.objectContaining({ error: '503 Service Unavailable' }),
    );
  });

  it('propagates secondary error when both fail', async () => {
    const primary: ChatProvider = { complete: vi.fn().mockRejectedValue(new Error('primary down')) };
    const secondary: ChatProvider = { complete: vi.fn().mockRejectedValue(new Error('secondary down')) };

    const provider = new FallbackChatProvider({ primary, secondary });

    await expect(provider.complete(DUMMY_INPUT)).rejects.toThrow('secondary down');
  });
});
