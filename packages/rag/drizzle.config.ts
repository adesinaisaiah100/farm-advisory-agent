import { defineConfig } from 'drizzle-kit';
import { config as loadEnv } from 'dotenv';

// Migrations and DDL need the direct endpoint: PgBouncer in transaction mode
// breaks the session-level statements drizzle-kit issues.
loadEnv({ path: '../../.env' });

const url = process.env.DATABASE_URL_UNPOOLED;
if (url === undefined) {
  throw new Error('DATABASE_URL_UNPOOLED is not set; run `neon link` then `neon env pull`');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
