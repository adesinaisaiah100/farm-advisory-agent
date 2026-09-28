import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests are opt-in via `pnpm test:integ`; they are excluded here
    // so the unit run needs no credentials and no network.
    exclude: ['**/node_modules/**', '**/*.integ.ts'],
    coverage: {
      provider: 'v8',
      // Integ sources are exercised by the gated run, not this one, so counting
      // them would report a real regression as if the unit suite were failing.
      exclude: ['**/*.integ.ts', '**/*.test.ts', 'vitest*.config.ts'],
    },
  },
});
