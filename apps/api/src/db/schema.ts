import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { documents } from '@poultry/rag';
import type { SessionState, SessionStatus } from '@poultry/schemas';

export const farmers = pgTable(
  'farmers',
  {
    phone: text('phone').primaryKey(),
    name: text('name'),
    state: text('state'),
    lga: text('lga'),
    farmSize: integer('farm_size'),
    species: text('species'),
    preferredLang: text('preferred_lang'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('farmers_phone_idx').on(table.phone),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    phone: text('phone').notNull(),
    status: text('status').$type<SessionStatus>().notNull(),
    caseId: text('case_id'),
    state: jsonb('state').$type<SessionState>().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    lastActive: timestamp('last_active', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('sessions_phone_idx').on(table.phone),
    // One open conversation per farmer. A closed session is kept for the
    // dashboard's history, so the constraint is partial rather than on `phone`
    // alone: it stops two concurrent WhatsApp turns from opening rival sessions
    // without ever forbidding a farmer from having many past cases.
    uniqueIndex('sessions_one_open_per_phone_idx')
      .on(table.phone)
      .where(sql`${table.status} = 'open'`),
  ],
);

/**
 * Upload metadata for a reference document. The clinical content lives in the
 * RAG tables (`documents`/`chunk_groups`/`chunks`); this table holds only what
 * the dashboard shows a clinician and what we need to fetch or delete the
 * original file again. Splitting them keeps `@poultry/rag` free of UI concerns.
 */
export const libraryDocuments = pgTable(
  'library_documents',
  {
    documentId: text('document_id')
      .primaryKey()
      .references(() => documents.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    r2Key: text('r2_key').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('library_documents_category_idx').on(table.category),
  ],
);

export const apiSchema = { sessions, farmers, libraryDocuments };
