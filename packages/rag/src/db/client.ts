import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { chunkGroups, chunks, documents } from './schema.js';

export const ragSchema = { documents, chunkGroups, chunks };

export type RagDatabase = NodePgDatabase<typeof ragSchema>;

export interface DbOptions {
  /** Direct (unpooled) endpoint. Migrations and DDL need it; PgBouncer in
   * transaction mode breaks SET and prepared statements. */
  connectionString: string;
  max?: number;
  applicationName?: string;
}

export function createPool(options: DbOptions): Pool {
  return new Pool({
    connectionString: options.connectionString,
    max: options.max ?? 4,
    application_name: options.applicationName ?? 'poultry-rag',
    // Neon presents a valid cert for its own endpoint; verification is handled by
    // the connection string, so the pool does not second-guess it.
    ssl: { rejectUnauthorized: false },
  });
}

export function createDb(pool: Pool): RagDatabase {
  return drizzle(pool, { schema: ragSchema });
}
