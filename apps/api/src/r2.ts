export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl?: string;
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

export async function signedR2Fetch(
  url: string,
  method: string,
  body: Uint8Array | undefined,
  contentType: string | undefined,
  creds: R2Config,
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
  const bodyBytes = body
    ? new Uint8Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength))
    : new Uint8Array(0);
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

  const headers: Record<string, string> = {
    'Authorization': authHeader,
    'Content-Type': contentType ?? 'application/octet-stream',
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': dateTimeStr,
  };
  if (body) {
    headers['Content-Length'] = String(bodyBytes.byteLength);
  }

  return fetch(url, {
    method,
    headers,
    body: body ? (bodyBytes.buffer.slice(0) as ArrayBuffer) : undefined,
    // @ts-expect-error duplex is needed in Node.js fetch for body streams
    duplex: 'half',
  });
}

export class R2StorageService {
  readonly #config: R2Config | null;

  constructor(config?: Partial<R2Config>) {
    if (config?.accountId && config?.accessKeyId && config?.secretAccessKey && config?.bucket) {
      this.#config = {
        accountId: config.accountId,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        bucket: config.bucket,
        publicUrl: config.publicUrl,
      };
    } else {
      this.#config = null;
    }
  }

  isConfigured(): boolean {
    return this.#config !== null;
  }

  /**
   * The bucket endpoint is only reachable with credentials, so it is never a
   * usable browser URL. A public URL is returned solely when the bucket is
   * actually published under a custom domain.
   */
  publicUrlFor(key: string): string | undefined {
    const base = this.#config?.publicUrl;
    return base ? `${base.replace(/\/$/, '')}/${key}` : undefined;
  }

  async #requireConfig(): Promise<R2Config> {
    if (!this.#config) {
      throw new Error(
        'R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ' +
          'R2_SECRET_ACCESS_KEY and R2_BUCKET before ingesting reference documents.',
      );
    }
    return this.#config;
  }

  #url(config: R2Config, key: string): string {
    return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${key}`;
  }

  async uploadFile(key: string, data: Uint8Array, contentType: string): Promise<void> {
    const config = await this.#requireConfig();
    const res = await signedR2Fetch(this.#url(config, key), 'PUT', data, contentType, config);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`R2 upload failed (${res.status} ${res.statusText}): ${errText.slice(0, 200)}`);
    }
  }

  async getFile(key: string): Promise<Uint8Array<ArrayBuffer>> {
    const config = await this.#requireConfig();
    const res = await signedR2Fetch(this.#url(config, key), 'GET', undefined, undefined, config);
    if (!res.ok) {
      throw new Error(`R2 download failed (${res.status} ${res.statusText})`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  async deleteFile(key: string): Promise<void> {
    const config = await this.#requireConfig();
    await signedR2Fetch(this.#url(config, key), 'DELETE', undefined, undefined, config).catch(() => {});
  }
}
