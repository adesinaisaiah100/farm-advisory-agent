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
import { R2MediaStore, GeminiTranscriber, ingestMedia } from '@poultry/media';

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
 * Build an R2-backed media intake using an S3-compatible fetch against
 * Cloudflare R2's public S3 API. Returns a stub (with a warning) when the
 * necessary env vars are not set so the bridge still starts cleanly in CI.
 */
function buildMediaIntake(
  env: ReturnType<typeof loadEnv>,
  log: Logger,
): MediaIntake {
  const { R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, GEMINI_API_KEY, GEMINI_TRANSCRIBE_MODEL } = env;

  if (!R2_ACCOUNT_ID || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !GEMINI_API_KEY) {
    log.warn('media intake not configured: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, GEMINI_API_KEY must all be set. Voice notes and images will be dropped.');
    return {
      async store({ media, mime }) {
        throw new Error(
          `no media intake configured; cannot store ${media.kind} (${mime})`,
        );
      },
    };
  }

  // R2 S3-compatible endpoint
  const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

  // Minimal S3-compatible bucket adapter — R2 supports AWS Signature V4
  const bucket = {
    async put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown> {
      const url = `${endpoint}/${R2_BUCKET}/${key}`;
      const contentType = options?.httpMetadata?.contentType ?? 'application/octet-stream';
      const res = await signedR2Fetch(url, 'PUT', value, contentType, { accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET });
      if (!res.ok) throw new Error(`R2 put failed: ${res.status} ${res.statusText}`);
      return res;
    },
    async get(key: string) {
      const url = `${endpoint}/${R2_BUCKET}/${key}`;
      const res = await signedR2Fetch(url, 'GET', undefined, undefined, { accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET });
      if (!res.ok) return null;
      return {
        arrayBuffer: () => res.arrayBuffer(),
        httpMetadata: { contentType: res.headers.get('content-type') ?? undefined },
        uploaded: new Date(res.headers.get('last-modified') ?? Date.now()),
      };
    },
    async delete(key: string): Promise<void> {
      const url = `${endpoint}/${R2_BUCKET}/${key}`;
      await signedR2Fetch(url, 'DELETE', undefined, undefined, { accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET });
    },
  };

  const store = new R2MediaStore(bucket);
  const transcriber = new GeminiTranscriber({ apiKey: GEMINI_API_KEY, model: GEMINI_TRANSCRIBE_MODEL });

  return {
    async store({ bytes, mime, phone, media: _media }) {
      const result = await ingestMedia(
        { store, transcriber, now: () => new Date(), newId: () => crypto.randomUUID() },
        { phone, mime, body: bytes },
      );
      // Return the R2 key as the mediaUrl so the turn handler can pass it to the core
      return result.media.r2Key;
    },
  };
}

/**
 * AWS Signature V4 signing for R2 S3-compatible API.
 * Minimal implementation covering PUT, GET, DELETE with no query params.
 */
async function signedR2Fetch(
  url: string,
  method: string,
  body: Uint8Array | undefined,
  contentType: string | undefined,
  creds: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string },
): Promise<Response> {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 8);
  const dateTimeStr = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const region = 'auto';
  const service = 's3';

  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const pathWithQuery = parsedUrl.pathname;

  const enc = new TextEncoder();
  const bodyBytes = body ? new Uint8Array(body) : new Uint8Array(0);
  const payloadHashBuf = await crypto.subtle.digest('SHA-256', bodyBytes.buffer.slice(0) as ArrayBuffer);
  const payloadHash = bufToHex(payloadHashBuf);

  const canonicalHeaders = [
    `content-type:${contentType ?? 'application/octet-stream'}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${dateTimeStr}`,
  ].join('\n') + '\n';

  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    method,
    pathWithQuery,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStr}/${region}/${service}/aws4_request`;
  const canonicalHashBuf = await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest));
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    dateTimeStr,
    credentialScope,
    bufToHex(canonicalHashBuf),
  ].join('\n');

  const signingKey = await deriveSigningKey(creds.secretAccessKey, dateStr, region, service);
  const signatureBuf = await crypto.subtle.sign('HMAC', signingKey, enc.encode(stringToSign));
  const signature = bufToHex(signatureBuf);

  const authHeader = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url, {
    method,
    headers: {
      'Authorization': authHeader,
      'Content-Type': contentType ?? 'application/octet-stream',
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': dateTimeStr,
    },
    body: body ? bodyBytes.buffer.slice(0) as ArrayBuffer : undefined,
  });
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function deriveSigningKey(secret: string, date: string, region: string, service: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const toKey = (raw: ArrayBuffer): Promise<CryptoKey> =>
    crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hmac = async (key: CryptoKey, data: string): Promise<ArrayBuffer> =>
    crypto.subtle.sign('HMAC', key, enc.encode(data));

  const kDate = await hmac(await toKey(enc.encode(`AWS4${secret}`).buffer.slice(0) as ArrayBuffer), date);
  const kRegion = await hmac(await toKey(kDate), region);
  const kService = await hmac(await toKey(kRegion), service);
  const kSigning = await hmac(await toKey(kService), 'aws4_request');
  return toKey(kSigning);
}

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

  const mediaIntake = buildMediaIntake(env, log);
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
      mediaIntake,
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
