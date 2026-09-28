import { describe, expect, it } from 'vitest';
import { toBase64 } from './base64.js';

describe('toBase64', () => {
  it('encodes bytes without Node globals', () => {
    expect(toBase64(new Uint8Array([104, 105]))).toBe('aGk=');
  });

  it('encodes an empty body as an empty string', () => {
    expect(toBase64(new Uint8Array())).toBe('');
  });

  it('round-trips a full byte range', () => {
    const every = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) every[i] = i;

    const decoded = new Uint8Array(Buffer.from(toBase64(every), 'base64'));

    expect(Array.from(decoded)).toEqual(Array.from(every));
  });

  it('handles a body larger than one chunk without overflowing the stack', () => {
    // A real voice note or photo is comfortably larger than the 32 KiB chunk, and
    // `String.fromCharCode(...bytes)` alone would blow the call stack here.
    const large = new Uint8Array(200_000).fill(7);

    const decoded = new Uint8Array(Buffer.from(toBase64(large), 'base64'));

    expect(decoded).toHaveLength(large.length);
    expect(decoded[199_999]).toBe(7);
  });
});
