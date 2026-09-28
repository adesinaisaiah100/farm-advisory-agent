import { describe, expect, it } from 'vitest';
import { Deduplicator, InMemoryDedupStore, type RawWaMessage } from '@poultry/bridge';
import {
  dispatch,
  type Clock,
  type DispatchDeps,
  type Logger,
  type TurnHandler,
} from './dispatch.js';
import {
  captionedPhoto,
  pidginVoiceNote,
  SELF_JID,
  textMessage,
  voiceNoteMislabelledAsImage,
} from '@poultry/bridge/src/fixtures/wa-events.js';

const NOW = new Date('2026-09-28T00:00:00.000Z');
const FARMER = '+2348082974602';
const clock: Clock = { now: () => NOW };

const silentLogger: Logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

interface Overrides {
  allowed?: string[];
  dedup?: Deduplicator;
  turn?: TurnHandler;
  download?: DispatchDeps['download'];
  mediaUrl?: string | Error;
}

function deps(overrides: Overrides = {}): DispatchDeps {
  const mediaUrl = overrides.mediaUrl ?? 'https://media.poultry.example/stored';
  return {
    dedup: overrides.dedup ?? new Deduplicator(new InMemoryDedupStore()),
    allowed: overrides.allowed ?? [FARMER],
    selfJid: SELF_JID,
    clock,
    download:
      overrides.download ?? (async () => ({ bytes: new Uint8Array([1, 2, 3]), mime: 'audio/ogg' })),
    mediaIntake: {
      store: async () => {
        if (mediaUrl instanceof Error) throw mediaUrl;
        return mediaUrl;
      },
    },
    turn: overrides.turn ?? {
      async handle() {
        return 'Which birds are affected?';
      },
    },
    log: silentLogger,
  };
}

describe('dispatch text', () => {
  it('turns a farmer message into a reply', async () => {
    const result = await dispatch(textMessage, deps());
    expect(result).toEqual({
      outcome: 'replied',
      waMsgId: '3EB0A1B2C3D4E5F60718',
      reply: 'Which birds are affected?',
    });
  });

  it('hands the turn the farmer address and the message body', async () => {
    const seen: string[] = [];
    await dispatch(
      textMessage,
      deps({
        turn: {
          async handle(message) {
            seen.push(message.from);
            return null;
          },
        },
      }),
    );
    expect(seen).toEqual([FARMER]);
  });

  it('reports silence as an accepted message rather than a failure', async () => {
    const result = await dispatch(
      textMessage,
      deps({
        turn: {
          async handle() {
            return null;
          },
        },
      }),
    );
    expect(result).toEqual({ outcome: 'accepted_no_reply', waMsgId: '3EB0A1B2C3D4E5F60718' });
  });

  it('ignores a message the normalizer rejects', async () => {
    const result = await dispatch(
      { ...textMessage, key: { ...textMessage.key, fromMe: true } },
      deps(),
    );
    expect(result).toEqual({ outcome: 'ignored', reason: 'own_message' });
  });
});

describe('dispatch allowlist', () => {
  it('refuses a farmer who is not configured', async () => {
    const result = await dispatch(textMessage, deps({ allowed: ['+2348011111111'] }));
    expect(result).toEqual({ outcome: 'not_allowed', waMsgId: '3EB0A1B2C3D4E5F60718' });
  });

  it('refuses everyone when the allowlist is empty', async () => {
    expect((await dispatch(textMessage, deps({ allowed: [] }))).outcome).toBe('not_allowed');
  });
});

describe('dispatch dedup', () => {
  it('answers a redelivered message only once', async () => {
    const dedup = new Deduplicator(new InMemoryDedupStore());
    const runner = deps({ dedup });

    expect((await dispatch(textMessage, runner)).outcome).toBe('replied');
    expect(await dispatch(textMessage, runner)).toEqual({
      outcome: 'duplicate',
      waMsgId: '3EB0A1B2C3D4E5F60718',
    });
  });
});

describe('dispatch media', () => {
  it('stores a voice note and passes its url to the turn', async () => {
    const urls: string[] = [];
    await dispatch(
      pidginVoiceNote,
      deps({
        turn: {
          async handle(message) {
            urls.push(message.media?.url ?? '');
            return null;
          },
        },
      }),
    );
    expect(urls).toEqual(['https://media.poultry.example/stored']);
  });

  it('transcribes a voice note that WhatsApp mislabels as a photo, rather than describing it as one', async () => {
    const kinds: string[] = [];
    await dispatch(
      voiceNoteMislabelledAsImage,
      deps({
        turn: {
          async handle(message) {
            kinds.push(`${message.media?.kind}:${message.media?.mime}`);
            return null;
          },
        },
      }),
    );
    expect(kinds).toEqual(['audio:audio/ogg']);
  });

  it('keeps a photo caption alongside the photo', async () => {
    let text: string | undefined;
    await dispatch(
      captionedPhoto,
      deps({
        turn: {
          async handle(message) {
            text = message.text;
            return null;
          },
        },
      }),
    );
    expect(text).toBe('This one was shaking this morning');
  });

  it('reports a failed download without answering', async () => {
    const result = await dispatch(pidginVoiceNote, deps({ download: async () => null }));
    expect(result).toEqual({
      outcome: 'failed',
      waMsgId: '3EB0A1B2C3D4E5F60719',
      reason: 'media_download_failed',
    });
  });

  it('reports failed storage without answering', async () => {
    const result = await dispatch(pidginVoiceNote, deps({ mediaUrl: new Error('R2 unavailable') }));
    expect(result).toEqual({
      outcome: 'failed',
      waMsgId: '3EB0A1B2C3D4E5F60719',
      reason: 'media_intake_failed',
    });
  });
});

describe('dispatch failures', () => {
  it('reports a turn that threw without crashing the socket loop', async () => {
    const result = await dispatch(
      textMessage,
      deps({
        turn: {
          async handle() {
            throw new Error('model down');
          },
        },
      }),
    );
    expect(result).toEqual({
      outcome: 'failed',
      waMsgId: '3EB0A1B2C3D4E5F60718',
      reason: 'turn_failed',
    });
  });

  it('drops a malformed sender at the allowlist without reaching a farmer', async () => {
    const broken: RawWaMessage = {
      ...textMessage,
      key: { ...textMessage.key, remoteJid: 'not-a-jid' },
    };
    const result = await dispatch(broken, deps());
    expect(result).toEqual({ outcome: 'not_allowed', waMsgId: '3EB0A1B2C3D4E5F60718' });
  });

  it('rejects a message the shared contract refuses even when the sender is allowlisted', async () => {
    // normalizePhone is deliberately lenient and only strips formatting, so a nonsense sender survives it as
    // "+notajid". The allowlist can be made to contain that string, and this is the last line of defence:
    // the shared InboundMessage contract refuses it instead of the turn inventing a farmer identity.
    const broken: RawWaMessage = {
      ...textMessage,
      key: { ...textMessage.key, remoteJid: 'not-a-jid' },
    };
    const result = await dispatch(broken, deps({ allowed: ['+notajid'] }));
    expect(result).toEqual({
      outcome: 'failed',
      waMsgId: '3EB0A1B2C3D4E5F60718',
      reason: 'contract_rejected',
    });
  });
});
