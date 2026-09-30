/* eslint-disable no-console */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '@poultry/rag';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

const pool = createPool({ connectionString, applicationName: 'apply-migration' });

async function run() {
  try {
    const sqlPath = path.resolve(__dirname, '../drizzle/0003_library_documents.sql');
    const rawSql = fs.readFileSync(sqlPath, 'utf-8');
    
    // Split on statement-breakpoint if needed or run directly
    const statements = rawSql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(`Executing ${statements.length} migration statements...`);

    for (let i = 0; i < statements.length; i++) {
      console.log(`Executing statement ${i + 1}...`);
      await pool.query(statements[i]);
    }

    console.log('Migration 0003_library_documents applied successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
