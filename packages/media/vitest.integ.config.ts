import { defineConfig } from 'vitest/config';

/**
 * Integration tests touch real R2 and the real Gemini API, so they never run in
 * `pnpm check`. They are opted in by `RUN_INTEG=1` and a missing key fails the
 * test rather than skipping it, because a silently green integ run is the thing
 * that has bitten this repo before.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.integ.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
