import type { InboundMessage } from '@poultry/schemas';
import type { Logger, TurnHandler } from './dispatch.js';

export interface HttpTurnOptions {
  readonly url: string;
  readonly fetch?: typeof fetch;
  readonly log?: Logger;
}

export function createHttpTurnHandler(options: HttpTurnOptions): TurnHandler {
  const fetchFn = options.fetch ?? fetch;
  const log = options.log;

  return {
    async handle(message: InboundMessage): Promise<string | null> {
      const text = message.text?.trim() ?? '';
      if (!text) {
        log?.debug('inbound message has no text to process', { id: message.id });
        return null;
      }

      try {
        const response = await fetchFn(options.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            farmerPhone: message.from,
            text,
          }),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          log?.error('turn API rejected request', {
            status: response.status,
            detail,
            phone: message.from,
          });
          return null;
        }

        const data = (await response.json()) as { reply?: string };
        if (typeof data.reply !== 'string' || data.reply.trim().length === 0) {
          log?.warn('turn API returned empty reply', { data });
          return null;
        }

        return data.reply;
      } catch (error) {
        log?.error('turn API request failed', { error: String(error), phone: message.from });
        return null;
      }
    },
  };
}
