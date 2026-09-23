import { describe, expect, it } from 'vitest';
import { normalizePhone, parseFarmer, safeParseFarmer } from './index.js';

describe('parseFarmer', () => {
  it('accepts a valid E.164 mobile number', () => {
    expect(parseFarmer({ phone: '+2348012345678' })).toEqual({ phone: '+2348012345678' });
  });

  it('accepts a local-format number', () => {
    expect(parseFarmer({ phone: '08012345678' })).toEqual({ phone: '08012345678' });
  });

  it('rejects a malformed number', () => {
    expect(safeParseFarmer({ phone: '12' }).success).toBe(false);
  });

  it('rejects a missing phone', () => {
    expect(safeParseFarmer({}).success).toBe(false);
  });
});

describe('normalizePhone', () => {
  it('converts local format to E.164', () => {
    expect(normalizePhone('08012345678')).toBe('+2348012345678');
  });

  it('passes through E.164 with country code', () => {
    expect(normalizePhone('+2348012345678')).toBe('+2348012345678');
  });

  it('strips country-code zero', () => {
    expect(normalizePhone('+23408012345678')).toBe('+2348012345678');
  });

  it('handles bare 234 prefix without plus', () => {
    expect(normalizePhone('2348012345678')).toBe('+2348012345678');
  });
});