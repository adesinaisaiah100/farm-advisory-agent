import { describe, expect, it } from 'vitest';
import { meta } from './index.js';

describe('meta', () => {
  it('builds structured metadata', () => {
    expect(meta('abc')).toEqual({ service: 'poultry-agent', eventId: 'abc' });
  });
});