import { describe, expect, it } from 'vitest';
import { isGreeting } from './greeting.js';

describe('isGreeting', () => {
  it('recognizes common greetings', () => {
    expect(isGreeting('Good morning!')).toBe(true);
  });

  it('ignores punctuation and case', () => {
    expect(isGreeting('  HOW FAR? ')).toBe(true);
  });

  it('rejects non-greetings', () => {
    expect(isGreeting('my birds are dying')).toBe(false);
  });

  it('does not treat a symptom report that starts like a greeting as one', () => {
    expect(isGreeting('hi my chickens are dying')).toBe(false);
  });
});
