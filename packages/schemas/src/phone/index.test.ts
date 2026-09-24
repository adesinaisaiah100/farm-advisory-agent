import { describe, expect, it } from 'vitest';
import { isValidPhone, normalizePhone, PhoneSchema } from './index.js';

const VALID_NUMBERS = ['+2348012345678', '08012345678', '+2348112233445', '+15551234567'];

const INVALID_NUMBERS = ['', '12', '080123', 'abcd', '08012345678901234', '+2348012345678extra'];

describe('PhoneSchema', () => {
  it.each(VALID_NUMBERS)('accepts valid number %s', (num) => {
    expect(PhoneSchema.safeParse(num).success).toBe(true);
  });

  it.each(INVALID_NUMBERS)('rejects invalid number %s', (num) => {
    expect(PhoneSchema.safeParse(num).success).toBe(false);
  });
});

describe('normalizePhone', () => {
  it.each([
    ['08012345678', '+2348012345678'],
    ['+2348012345678', '+2348012345678'],
    ['+23408012345678', '+2348012345678'],
    ['2348012345678', '+2348012345678'],
    ['0801 234 5678', '+2348012345678'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe('isValidPhone', () => {
  it('accepts local and E.164 formats', () => {
    expect(isValidPhone('08012345678')).toBe(true);
    expect(isValidPhone('+2348012345678')).toBe(true);
  });

  it('rejects junk', () => {
    expect(isValidPhone('hello')).toBe(false);
  });
});