import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('applies defaults when nothing is configured', () => {
    const env = loadEnv({});
    expect(env.BRIDGE_SESSION_DIR).toBe('./.bridge-session');
    expect(env.BRIDGE_OUTBOX_POLL_MS).toBe(10_000);
  });

  it('reads the allowlist and log level from the environment', () => {
    const env = loadEnv({ BRIDGE_ALLOWED_FROM: '+2348082974602', BRIDGE_LOG_LEVEL: 'debug' });
    expect(env.BRIDGE_ALLOWED_FROM).toBe('+2348082974602');
    expect(env.BRIDGE_LOG_LEVEL).toBe('debug');
  });

  it('rejects an unknown log level rather than silently defaulting', () => {
    expect(() => loadEnv({ BRIDGE_LOG_LEVEL: 'chatty' })).toThrow(/invalid bridge configuration/);
  });

  it('rejects a turn url that is not a url', () => {
    expect(() => loadEnv({ BRIDGE_TURN_URL: 'not a url' })).toThrow(/invalid bridge configuration/);
  });

  it('refuses a poll interval so small it would hammer the outbox', () => {
    expect(() => loadEnv({ BRIDGE_OUTBOX_POLL_MS: '10' })).toThrow(/invalid bridge configuration/);
  });
});
