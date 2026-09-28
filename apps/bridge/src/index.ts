import {
  Deduplicator,
  InMemoryDedupStore,
  parseAllowedFrom,
  type RawWaMessage,
} from '@poultry/bridge';
import { loadEnv } from './env.js';
import {
  dispatch,
  type Clock,
  type Logger,
  type MediaIntake,
  type TurnHandler,
} from './dispatch.js';
import { connectSocket, downloadMedia } from './socket.js';

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'silent'] as const;

function consoleLogger(level: (typeof LEVELS)[number]): Logger {
  const rank = LEVELS.indexOf(level);
  const emit =
    (name: 'debug' | 'info' | 'warn' | 'error', min: number) =>
    (message: string, fields?: Record<string, unknown>): void => {
      if (rank < min || rank === LEVELS.length - 1) return;
      const line = JSON.stringify({ level: name, message, ...fields });
      if (name === 'error') console.error(line);
      else if (name === 'warn') console.warn(line);
      else console.log(line);
    };
  return {
    debug: emit('debug', LEVELS.indexOf('debug')),
    info: emit('info', LEVELS.indexOf('info')),
    warn: emit('warn', LEVELS.indexOf('warn')),
    error: emit('error', LEVELS.indexOf('error')),
  };
}

/**
 * Phase 7 ships transport, not the turn. Returning `null` keeps the bridge silent rather than inventing a
 * reply: an improvised "consult a vet" string from the transport layer is still content the product never
 * chose, and Phase 8 is where the orchestrator becomes the only source of farmer-facing words.
 */
const unhandledTurn: TurnHandler = {
  async handle() {
    return null;
  },
};

const unconfiguredMediaIntake: MediaIntake = {
  async store({ mime, media }) {
    throw new Error(
      `no media intake configured; cannot store ${media.kind} (${mime}) for the core to read`,
    );
  },
};

const clock: Clock = { now: () => new Date() };

async function main(): Promise<void> {
  const env = loadEnv();
  const log = consoleLogger(env.BRIDGE_LOG_LEVEL);
  const allowed = parseAllowedFrom(env.BRIDGE_ALLOWED_FROM);

  if (allowed.length === 0) {
    log.warn('BRIDGE_ALLOWED_FROM is empty, so the bridge will answer nobody until you set it');
  }

  const dedup = new Deduplicator(new InMemoryDedupStore());
  let selfJid = '';

  const handle = async (raw: RawWaMessage): Promise<void> => {
    const result = await dispatch(raw, {
      dedup,
      allowed,
      selfJid,
      clock,
      download: async (message, media) => {
        const bytes = await downloadMedia(bridge.sock, message, media);
        return bytes ? { bytes, mime: media.mime } : null;
      },
      mediaIntake: unconfiguredMediaIntake,
      turn: unhandledTurn,
      log,
    });
    log.info('dispatch', { ...result });
  };

  const bridge = await connectSocket({
    authDir: env.BRIDGE_SESSION_DIR,
    log,
    onMessage: handle,
    onReady: async (jid) => {
      selfJid = jid;
    },
  });

  selfJid = bridge.selfJid();

  if (!env.BRIDGE_TURN_URL) {
    log.warn(
      'BRIDGE_TURN_URL is unset, so messages are received and acknowledged but no reply is produced yet',
    );
  }

  log.info('outbox poller not started: no durable outbox table exists yet');

  const shutdown = (): void => {
    log.info('shutting down');
    bridge.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({ level: 'error', message: 'bridge failed to start', error: String(error) }),
  );
  process.exit(1);
});
