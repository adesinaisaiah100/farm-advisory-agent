import { describe, expect, it } from 'vitest';
import { MediaError, SUPPORTED_MIME_TYPES, extensionFor, mediaKey } from './key.js';

const day = new Date('2026-09-28T14:03:11.000Z');
const id = '018f3c2a-1b2c-7d4e-8f90-0123456789ab';

describe('mediaKey', () => {
  it('builds media/{phone}/{date}/{uuid}.{ext} from an E.164 number', () => {
    expect(
      mediaKey({ phone: '+2348082974602', date: day, id, mime: 'image/jpeg' }),
    ).toBe(`media/2348082974602/2026-09-28/${id}.jpg`);
  });

  it('strips the plus sign so the key is safe inside a URL path', () => {
    const key = mediaKey({ phone: '+2348082974602', date: day, id, mime: 'audio/mpeg' });
    expect(key.startsWith('media/234')).toBe(true);
    expect(key).not.toContain('+');
  });

  it('uses the UTC date so a late-night message does not file under tomorrow', () => {
    const late = new Date('2026-09-28T23:59:59.000Z');
    expect(mediaKey({ phone: '+2348082974602', date: late, id, mime: 'image/png' })).toContain(
      '/2026-09-28/',
    );
  });

  it('gives two uploads of the same second different keys', () => {
    const a = mediaKey({ phone: '+2348082974602', date: day, id, mime: 'image/png' });
    const b = mediaKey({
      phone: '+2348082974602',
      date: day,
      id: '018f3c2a-1b2c-7d4e-8f90-0fffffffffff',
      mime: 'image/png',
    });
    expect(a).not.toBe(b);
  });

  it('refuses a phone with no digits rather than writing an empty segment', () => {
    expect(() => mediaKey({ phone: 'unknown', date: day, id, mime: 'image/png' })).toThrow(
      MediaError,
    );
  });

  it('rejects an invalid date from a broken clock', () => {
    expect(() =>
      mediaKey({ phone: '+2348082974602', date: new Date('not a date'), id, mime: 'image/png' }),
    ).toThrow(/not a valid Date/);
  });

  it('refuses to invent an extension for an unmapped mime type', () => {
    expect(() => mediaKey({ phone: '+2348082974602', date: day, id, mime: 'text/plain' })).toThrow(
      /refusing to guess/,
    );
  });
});

describe('extensionFor', () => {
  it('normalises casing and strips codec parameters', () => {
    expect(extensionFor('IMAGE/JPEG')).toBe('jpg');
    expect(extensionFor('audio/ogg; codecs=opus')).toBe('ogg');
  });

  it('maps audio m4a to the m4a extension', () => {
    expect(extensionFor('audio/mp4')).toBe('m4a');
  });

  it('maps pdf to the document extension', () => {
    expect(extensionFor('application/pdf')).toBe('pdf');
  });

  it('has an extension for every mime type it advertises', () => {
    for (const mime of SUPPORTED_MIME_TYPES) {
      expect(extensionFor(mime)).toMatch(/^[a-z0-9]+$/);
    }
  });

  it('advertises no mime type without an extension', () => {
    const missing = SUPPORTED_MIME_TYPES.filter(
      (mime) => extensionFor(mime).length === 0,
    );
    expect(missing).toEqual([]);
  });
});
