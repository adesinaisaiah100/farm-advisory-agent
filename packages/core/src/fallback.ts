import type { ChatProvider, ChatInput } from './providers.js';

export interface FallbackChatProviderOptions {
  primary: ChatProvider;
  secondary: ChatProvider;
  log?: (message: string, fields?: Record<string, unknown>) => void;
}

/**
 * A resilient ChatProvider that attempts completions with a primary provider
 * (e.g. Gemini), and transparently falls back to a secondary provider (e.g.
 * OpenRouter) if the primary fails due to rate limits (429), high-volume
 * overload (503), timeouts, or provider outages.
 */
export class FallbackChatProvider implements ChatProvider {
  readonly #primary: ChatProvider;
  readonly #secondary: ChatProvider;
  readonly #log?: (message: string, fields?: Record<string, unknown>) => void;

  constructor(options: FallbackChatProviderOptions) {
    this.#primary = options.primary;
    this.#secondary = options.secondary;
    this.#log = options.log;
  }

  async complete(input: ChatInput): Promise<unknown> {
    try {
      return await this.#primary.complete(input);
    } catch (primaryError) {
      this.#log?.('primary chat provider failed; attempting fallback to secondary', {
        error: primaryError instanceof Error ? primaryError.message : String(primaryError),
      });
      return await this.#secondary.complete(input);
    }
  }
}
