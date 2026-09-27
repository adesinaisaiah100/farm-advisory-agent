import { defineConfig } from 'vitest/config';

// Integration runs share one Neon database and one provider quota, so they are
// serial and given a long timeout for cold pools and a first-call embed.
export default defineConfig({
  test: {
    include: ['src/**/*.integ.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
