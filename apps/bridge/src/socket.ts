import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import type { NormalizedMedia, RawWaMessage } from '@poultry/bridge';
import type { Logger } from './dispatch.js';

/** `ILogger` is not re-exported from the package root, so it is read off the socket factory's own options. */
type BaileysLogger = NonNullable<NonNullable<Parameters<typeof makeWASocket>[0]>['logger']>;

export interface SocketDeps {
  readonly authDir: string;
  readonly log: Logger;
  readonly onMessage: (raw: RawWaMessage) => void | Promise<void>;
  readonly onReady: (selfJid: string) => void | Promise<void>;
}

export interface BridgeSocket {
  readonly sock: WASocket;
  selfJid(): string;
  close(): void;
}

type LogSink = (message: string, fields?: Record<string, unknown>) => void;

/** Baileys logs `(object, message)`, but also calls `child()` and expects an `ILogger` back. */
function split(
  obj: unknown,
  msg: string | undefined,
): { text: string; fields: Record<string, unknown> } {
  if (typeof obj === 'string') return { text: msg ?? obj, fields: {} };
  if (obj && typeof obj === 'object') {
    return { text: msg ?? 'baileys', fields: obj as Record<string, unknown> };
  }
  return { text: msg ?? 'baileys', fields: { detail: String(obj) } };
}

/**
 * Baileys emits `trace` on every websocket frame, which is unusable beside a farmer-facing process, so the
 * library's own stream is folded into our log at the levels below. The two exceptions are `warn` and `error`,
 * because a rejected session or a bad media re-upload is genuinely worth seeing.
 */
function toBaileysLogger(log: Logger): BaileysLogger {
  const build = (tag: string): BaileysLogger => {
    const emit = (sink: LogSink, obj: unknown, msg?: string): void => {
      const { text, fields } = split(obj, msg);
      sink(text, { baileys: tag, ...fields });
    };
    return {
      level: 'info',
      child: (obj: Record<string, unknown>) => build(JSON.stringify(obj)),
      trace: (obj: unknown, msg?: string) => emit(log.debug, obj, msg),
      debug: (obj: unknown, msg?: string) => emit(log.debug, obj, msg),
      info: (obj: unknown, msg?: string) => emit(log.debug, obj, msg),
      warn: (obj: unknown, msg?: string) => emit(log.warn, obj, msg),
      error: (obj: unknown, msg?: string) => emit(log.error, obj, msg),
    };
  };
  return build('socket');
}

/** `Boom` carries a status code, but `@hapi/boom` is only a transitive dep, so it is read structurally. */
function statusCodeOf(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('output' in error)) return undefined;
  const output = (error as { output?: { statusCode?: unknown } }).output;
  return typeof output?.statusCode === 'number' ? output.statusCode : undefined;
}

function toRaw(message: WAMessage): RawWaMessage {
  return {
    key: {
      id: message.key?.id ?? undefined,
      remoteJid: message.key?.remoteJid ?? undefined,
      fromMe: message.key?.fromMe ?? undefined,
      participant: message.key?.participant ?? undefined,
    },
    message: message.message as RawWaMessage['message'],
    messageTimestamp: message.messageTimestamp as RawWaMessage['messageTimestamp'],
  };
}

export async function connectSocket(deps: SocketDeps): Promise<BridgeSocket> {
  const logger = toBaileysLogger(deps.log);
  let isClosing = false;
  let currentSock!: WASocket;

  async function init(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(deps.authDir);
    const { version } = await fetchLatestBaileysVersion();

    currentSock = makeWASocket({
      version,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      logger,
    });

    currentSock.ev.on('creds.update', saveCreds);

    currentSock.ev.on('connection.update', (update) => {
      if (update.qr) {
        deps.log.info('scan this QR code in WhatsApp to pair the bridge');
        qrcode.generate(update.qr, { small: true });
      }
      if (update.connection === 'open') {
        const self = currentSock.user?.id;
        if (self) {
          deps.log.info('bridge connected', { self });
          // Without this the first inbound message normalizes with an empty selfJid, so a farmer's own
          // message would be classified as coming from the farmer rather than from us.
          void deps.onReady(self);
        }
      }
      if (update.connection === 'close') {
        const status = statusCodeOf(update.lastDisconnect?.error);
        if (status === DisconnectReason.loggedOut) {
          deps.log.warn('this WhatsApp account was unlinked; delete the auth dir to pair again');
        } else {
          deps.log.warn('bridge disconnected, waiting for WhatsApp to let it back in', { status });
          if (!isClosing) {
            setTimeout(() => {
              init().catch((err: unknown) => {
                deps.log.error('failed to reconnect bridge socket', { error: String(err) });
                if (!isClosing) {
                  setTimeout(() => {
                    void init().catch(() => {});
                  }, 3000);
                }
              });
            }, 1500);
          }
        }
      }
    });

    currentSock.ev.on('messages.upsert', ({ messages }) => {
      for (const message of messages) {
        void deps.onMessage(toRaw(message));
      }
    });
  }

  await init();

  return {
    get sock() {
      return currentSock;
    },
    selfJid: () => currentSock.user?.id ?? '',
    close: () => {
      isClosing = true;
      currentSock.ev.removeAllListeners('messages.upsert');
      void currentSock.end(undefined);
    },
  };
}

export async function downloadMedia(
  _sock: WASocket,
  raw: RawWaMessage,
  _media: NormalizedMedia,
): Promise<Uint8Array | null> {
  const message = raw as unknown as WAMessage;
  if (!message.message) return null;
  try {
    // 6.7.24 takes the download context as a fourth argument and only the host protocol can build it, so
    // there is no re-upload retry here: media WhatsApp has already expired fails instead of retrying.
    const buffer = await downloadMediaMessage(message, 'buffer', {});
    if (!buffer) return null;
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}
