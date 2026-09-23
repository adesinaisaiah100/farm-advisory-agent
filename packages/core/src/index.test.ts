import { describe, expect, it } from 'vitest';
import { greeting } from './index.js';
import type { Farmer } from '@poultry/schemas';

describe('greeting', () => {
  it('greets by name', () => {
    const farmer: Farmer = { phone: '+2348012345678', name: 'Adaeze' };
    expect(greeting(farmer)).toBe('Hello Adaeze!');
  });

  it('falls back to generic greeting', () => {
    expect(greeting(undefined)).toBe('Hello!');
  });
});