import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  vector,
} from 'drizzle-orm/pg-core';
import type { Disease } from '@poultry/schemas';
import type { SectionKind, SourceSpecies, Treatment } from '../schema.js';
import { EMBED_DIMS } from '../embed/embedder.js';

export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  publisher: text('publisher').notNull(),
  docType: text('doc_type').notNull(),
  year: integer('year'),
  url: text('url'),
});

export const chunkGroups = pgTable(
  'chunk_groups',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    heading: text('heading').notNull(),
    sectionKind: text('section_kind').$type<SectionKind>().notNull(),
    species: text('species').array().$type<SourceSpecies[]>().notNull(),
    diseases: text('diseases').array().$type<Disease[]>().notNull(),
    treatment: jsonb('treatment').$type<Treatment | null>(),
    page: integer('page').notNull(),
    pageEnd: integer('page_end').notNull(),
    text: text('text').notNull(),
  },
  (table) => [
    index('chunk_groups_document_id_idx').on(table.documentId),
    index('chunk_groups_section_kind_idx').on(table.sectionKind),
    index('chunk_groups_species_gin').using('gin', table.species),
    index('chunk_groups_diseases_gin').using('gin', table.diseases),
  ],
);

export const chunks = pgTable(
  'chunks',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => chunkGroups.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    text: text('text').notNull(),
    heading: text('heading').notNull(),
    sectionKind: text('section_kind').$type<SectionKind>().notNull(),
    species: text('species').array().$type<SourceSpecies[]>().notNull(),
    diseases: text('diseases').array().$type<Disease[]>().notNull(),
    treatment: jsonb('treatment').$type<Treatment | null>(),
    page: integer('page').notNull(),
    pageEnd: integer('page_end').notNull(),
    tokenCount: integer('token_count').notNull(),
    oversized: boolean('oversized').notNull(),
    source: text('source').notNull(),
    publisher: text('publisher').notNull(),
    locator: text('locator').notNull(),
    embedding: vector('embedding', { dimensions: EMBED_DIMS }).notNull(),
  },
  (table) => [
    // Cosine opclass, so the index matches the operator the search half issues.
    // pgvector's cosine operator is scale-invariant, but the HNSW index is built
    // on whatever is stored, so vectors are normalized on write to keep the
    // stored form canonical across operators.
    index('chunks_embedding_hnsw').using('hnsw', table.embedding.op('vector_cosine_ops')),
    index('chunks_document_id_idx').on(table.documentId),
    index('chunks_group_id_idx').on(table.groupId),
    index('chunks_section_kind_idx').on(table.sectionKind),
    index('chunks_species_gin').using('gin', table.species),
    index('chunks_diseases_gin').using('gin', table.diseases),
  ],
);

export type DocumentRow = typeof documents.$inferSelect;
export type ChunkGroupRow = typeof chunkGroups.$inferSelect;
export type ChunkRow = typeof chunks.$inferSelect;
