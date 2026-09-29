import makeWASocket, {
  DisconnectReason,
  downloadContentFromMessage,
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

const lidToPn = new Map<string, string>();
// Pre-seed with verified pairs so immediate messages resolve before background contact sync completes
lidToPn.set('16321228075151@lid', '2349155132405@s.whatsapp.net');
lidToPn.set('16321228075151', '2349155132405@s.whatsapp.net');

function toRaw(message: WAMessage): RawWaMessage {
  const remote = message.key?.remoteJid;
  const mappedPn =
    (message.key as { senderPn?: string })?.senderPn ??
    (message.key as { participantPn?: string })?.participantPn ??
    (remote ? lidToPn.get(remote) : undefined) ??
    (remote ? lidToPn.get(remote.split('@')[0] ?? '') : undefined);

  return {
    key: {
      id: message.key?.id ?? undefined,
      remoteJid: message.key?.remoteJid ?? undefined,
      fromMe: message.key?.fromMe ?? undefined,
      participant: message.key?.participant ?? undefined,
      senderPn: mappedPn ?? undefined,
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

    const registerContact = (c: { id?: string; lid?: string; jid?: string }): void => {
      const pn = c.jid ?? (c.id?.endsWith('@s.whatsapp.net') ? c.id : undefined);
      const lid = c.lid ?? (c.id?.endsWith('@lid') ? c.id : undefined);
      if (pn && lid) {
        lidToPn.set(lid, pn);
        lidToPn.set(lid.split('@')[0] ?? '', pn);
      }
    };

    currentSock.ev.on('contacts.upsert', (contacts) => {
      for (const c of contacts) registerContact(c);
    });

    currentSock.ev.on('contacts.update', (updates) => {
      for (const c of updates) registerContact(c);
    });

    currentSock.ev.on('messaging-history.set', ({ contacts }) => {
      if (contacts) {
        for (const c of contacts) registerContact(c);
      }
    });

    currentSock.ev.on('chats.phoneNumberShare', ({ lid, jid }) => {
      if (lid && jid) {
        lidToPn.set(lid, jid);
        lidToPn.set(lid.split('@')[0] ?? '', jid);
      }
    });

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

function getInnerMedia(msg: unknown): { content: any; type: string } | null {
  let curr: any = msg;
  for (let i = 0; i < 5; i++) {
    if (!curr || typeof curr !== 'object') break;
    const inner =
      curr.ephemeralMessage?.message ||
      curr.viewOnceMessage?.message ||
      curr.viewOnceMessageV2?.message ||
      curr.viewOnceMessageV2Extension?.message ||
      curr.documentWithCaptionMessage?.message ||
      curr.editedMessage?.message?.protocolMessage?.editedMessage;
    if (!inner) break;
    curr = inner;
  }
  if (!curr || typeof curr !== 'object') return null;
  if (curr.imageMessage) return { content: curr.imageMessage, type: 'image' };
  if (curr.audioMessage) return { content: curr.audioMessage, type: 'audio' };
  if (curr.videoMessage) return { content: curr.videoMessage, type: 'video' };
  if (curr.documentMessage) return { content: curr.documentMessage, type: 'document' };
  if (curr.stickerMessage) return { content: curr.stickerMessage, type: 'sticker' };
  return null;
}

export async function downloadMedia(
  _sock: WASocket,
  raw: RawWaMessage,
  _media: NormalizedMedia,
): Promise<Uint8Array | null> {
  const message = raw as unknown as WAMessage;
  if (!message.message) return null;

  // 1. Try Baileys' high-level downloadMediaMessage
  try {
    const buffer = await downloadMediaMessage(message, 'buffer', {});
    if (buffer) return new Uint8Array(buffer);
  } catch {
    // If high-level download fails (e.g. nested view-once structure or missing context), fall through to stream
  }

  // 2. Direct fallback via downloadContentFromMessage on unwrapped media
  try {
    const inner = getInnerMedia(message.message);
    if (inner && (inner.content.url || inner.content.directPath)) {
      const stream = await downloadContentFromMessage(inner.content, inner.type as any);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
      }
      const combined = Buffer.concat(chunks);
      if (combined.length > 0) return new Uint8Array(combined);
    }
  } catch (fallbackErr) {
    console.error('[bridge] downloadContentFromMessage fallback failed:', fallbackErr);
  }

  return null;
}
