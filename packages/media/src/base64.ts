/**
 * The API runs this code on Cloudflare Workers and the bridge runs it on Node,
 * so the media package cannot assume a Node global. `Buffer` is absent on
 * Workers, and `btoa` is present on Workers, in browsers and in Node.
 */
const CHUNK = 0x8000;

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // Spreading a whole media file into `String.fromCharCode` overflows the call
  // stack, so it is walked in chunks.
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}
