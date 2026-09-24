import { describe, expect, it } from 'vitest';
import { DateTimeSchema, UuidSchema } from './index.js';

describe('UuidSchema', () => {
  it('accepts a valid v4 uuid', () => {
    const uuid = '9d47f8cd-4b6f-4f1a-8a6b-9ae1aef9b701';
    expect(UuidSchema.parse(uuid)).toBe(uuid);
  });

  it('rejects a non-uuid string', () => {
    expect(UuidSchema.safeParse('abc').success).toBe(false);
  });
});

describe('DateTimeSchema', () => {
  it('accepts an ISO datetime', () => {
    const dt = '2026-09-24T10:00:00.000Z';
    expect(DateTimeSchema.parse(dt)).toBe(dt);
  });

  it('rejects a date-only string', () => {
    expect(DateTimeSchema.safeParse('2026-09-24').success).toBe(false);
  });
});