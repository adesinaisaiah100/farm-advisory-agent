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
} from './dispatch.js';
import { createHttpTurnHandler } from './turn.js';
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

  const turnUrl = env.BRIDGE_TURN_URL ?? 'http://127.0.0.1:3000/chat';
  const turn = createHttpTurnHandler({ url: turnUrl, log });
  log.info('turn handler connected', { turnUrl });

  const dedup = new Deduplicator(new InMemoryDedupStore());
  let selfJid = '';

  const handle = async (raw: RawWaMessage): Promise<void> => {
    log.info('inbound wa message received', {
      id: raw.key?.id,
      remoteJid: raw.key?.remoteJid,
      senderPn: raw.key?.senderPn,
      fromMe: raw.key?.fromMe,
    });
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
      turn,
      log,
    });
    log.info('dispatch', { ...result });

    const remoteJid = raw.key?.remoteJid;
    if (result.outcome === 'replied' && remoteJid) {
      try {
        await bridge.sock.sendMessage(remoteJid, { text: result.reply });
        log.info('sent reply to WhatsApp', { to: remoteJid, waMsgId: result.waMsgId });
      } catch (error) {
        log.error('failed to send reply to WhatsApp', {
          error: String(error),
          to: remoteJid,
        });
      }
    }
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
