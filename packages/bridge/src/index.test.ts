import { describe, expect, it } from 'vitest';
import { isGreeting, type InboundMessage } from './index.js';

const msg: InboundMessage = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  from: '+2348012345678',
  to: '08012345678',
  text: 'Good morning!',
  receivedAt: '2026-09-22T08:00:00Z',
};

describe('isGreeting', () => {
  it('recognizes common greetings', () => {
    expect(isGreeting(msg.text ?? '')).toBe(true);
  });

  it('rejects non-greetings', () => {
    expect(isGreeting('my birds are dying')).toBe(false);
  });
});