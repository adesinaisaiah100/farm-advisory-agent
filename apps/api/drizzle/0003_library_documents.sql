-- Upload metadata for the Veterinary Reference Library.
-- Clinical content (documents/chunk_groups/chunks) lives in the Phase 5 RAG
-- migration; this table only records what the dashboard shows and what we need
-- to fetch or delete the original file again.
--
-- NOT YET APPLIED to Neon. Apply deliberately:
--   psql "$DATABASE_URL" -f apps/api/drizzle/0003_library_documents.sql
CREATE TABLE "library_documents" (
	"document_id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"r2_key" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "library_documents_category_idx" ON "library_documents" USING btree ("category");
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'library_documents_document_id_fkey'
	) THEN
		ALTER TABLE "library_documents"
			ADD CONSTRAINT "library_documents_document_id_fkey"
			FOREIGN KEY ("document_id") REFERENCES "documents"("id")
			ON DELETE cascade ON UPDATE no action;
	END IF;
END
$$;
