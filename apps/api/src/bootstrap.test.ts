import { describe, expect, it } from 'vitest';
import { buildApiDeps, readRuntimeEnv } from './bootstrap.js';

const FULL_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pw@host/db',
  GEMINI_API_KEY: 'dev-key',
};

describe('readRuntimeEnv', () => {
  it('defaults NODE_ENV to development so a missing var cannot select prod keys', () => {
    const env = readRuntimeEnv({ DATABASE_URL: 'postgresql://u@h/d' });

    expect(env.nodeEnv).toBe('development');
  });

  it('reads the prod key from its own variable', () => {
    const env = readRuntimeEnv({ NODE_ENV: 'production', GEMINI_API_KEY_PROD: 'prod-key' });

    expect(env.geminiApiKeyProd).toBe('prod-key');
  });
});

describe('buildApiDeps', () => {
  it('wires chat and ready when every variable is present', () => {
    const { deps, problem } = buildApiDeps(readRuntimeEnv(FULL_ENV));

    expect(problem).toBeUndefined();
    expect(deps.chat).toBeDefined();
    expect(deps.ready).toBeDefined();
  });

  it('refuses to boot without DATABASE_URL, naming the variable', () => {
    const { deps, problem } = buildApiDeps(
      readRuntimeEnv({ NODE_ENV: 'test', GEMINI_API_KEY: 'dev-key' }),
    );

    expect(problem).toContain('DATABASE_URL');
    expect(deps.chat).toBeUndefined();
  });

  it('refuses to boot in production without the prod key', () => {
    const { problem } = buildApiDeps(
      readRuntimeEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u@h/d', GEMINI_API_KEY: 'dev-key' }),
    );

    // The dev key is present and must still be refused: silently serving
    // production traffic from the dev project is how both projects get
    // rate-limited at once.
    expect(problem).toContain('GEMINI_API_KEY');
  });

  it('refuses to boot with no Gemini key at all', () => {
    const { problem } = buildApiDeps(readRuntimeEnv({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://u@h/d' }));

    expect(problem).toContain('GEMINI_API_KEY');
  });

  it('lists every missing variable, so a misconfigured deploy is fixed in one pass', () => {
    const { problem } = buildApiDeps(readRuntimeEnv({}));

    expect(problem).toContain('DATABASE_URL');
    expect(problem).toContain('GEMINI_API_KEY');
  });
});
