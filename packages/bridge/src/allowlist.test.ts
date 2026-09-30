import { describe, expect, it } from 'vitest';
import { isFarmerAllowed, parseAllowedFrom } from './allowlist.js';

const FARMER = '+2348082974602';

describe('parseAllowedFrom', () => {
  it('reads a comma-separated list of phone numbers', () => {
    expect(parseAllowedFrom(`${FARMER},+2348012345678`)).toEqual([FARMER, '+2348012345678']);
  });

  it('tolerates whitespace around entries', () => {
    expect(parseAllowedFrom(` ${FARMER} , +2348012345678 `)).toEqual([FARMER, '+2348012345678']);
  });

  it('drops entries that are not phone numbers', () => {
    expect(parseAllowedFrom(`${FARMER},everyone,not-a-phone`)).toEqual([FARMER]);
  });

  it('returns an empty list for missing config, so the channel stays closed', () => {
    expect(parseAllowedFrom(undefined)).toEqual([]);
  });
});

describe('isFarmerAllowed', () => {
  it('lets a listed farmer through', () => {
    expect(isFarmerAllowed(FARMER, [FARMER])).toBe(true);
  });

  it('blocks a farmer who is not listed', () => {
    expect(isFarmerAllowed('+2348099999999', [FARMER])).toBe(false);
  });

  it('allows everyone when no allowlist is configured (open pilot mode)', () => {
    expect(isFarmerAllowed(FARMER, [])).toBe(true);
  });
});
