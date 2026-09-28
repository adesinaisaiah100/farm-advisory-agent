import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { apiSchema } from './schema.js';

/**
 * The HTTP driver, not a TCP pool. A Worker cannot open a raw socket, and
 * `drizzle-orm/neon-http` is a thin `fetch` wrapper, so the same queries that run
 * in the Worker also run in the Node test process and the ingest scripts.
 */
export function createApiDb(connectionString: string) {
  return drizzle(neon(connectionString), { schema: apiSchema });
}

export type ApiDatabase = ReturnType<typeof createApiDb>;

export { apiSchema };
