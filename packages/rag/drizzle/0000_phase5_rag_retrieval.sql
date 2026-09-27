CREATE TABLE "chunk_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"heading" text NOT NULL,
	"section_kind" text NOT NULL,
	"species" text[] NOT NULL,
	"diseases" text[] NOT NULL,
	"treatment" jsonb,
	"page" integer NOT NULL,
	"page_end" integer NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"document_id" text NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"heading" text NOT NULL,
	"section_kind" text NOT NULL,
	"species" text[] NOT NULL,
	"diseases" text[] NOT NULL,
	"treatment" jsonb,
	"page" integer NOT NULL,
	"page_end" integer NOT NULL,
	"token_count" integer NOT NULL,
	"oversized" boolean NOT NULL,
	"source" text NOT NULL,
	"publisher" text NOT NULL,
	"locator" text NOT NULL,
	"embedding" vector(768) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"publisher" text NOT NULL,
	"doc_type" text NOT NULL,
	"year" integer,
	"url" text
);
--> statement-breakpoint
ALTER TABLE "chunk_groups" ADD CONSTRAINT "chunk_groups_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_group_id_chunk_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."chunk_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chunk_groups_document_id_idx" ON "chunk_groups" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "chunk_groups_section_kind_idx" ON "chunk_groups" USING btree ("section_kind");--> statement-breakpoint
CREATE INDEX "chunk_groups_species_gin" ON "chunk_groups" USING gin ("species");--> statement-breakpoint
CREATE INDEX "chunk_groups_diseases_gin" ON "chunk_groups" USING gin ("diseases");--> statement-breakpoint
CREATE INDEX "chunks_embedding_hnsw" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "chunks_document_id_idx" ON "chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "chunks_group_id_idx" ON "chunks" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "chunks_section_kind_idx" ON "chunks" USING btree ("section_kind");--> statement-breakpoint
CREATE INDEX "chunks_species_gin" ON "chunks" USING gin ("species");--> statement-breakpoint
CREATE INDEX "chunks_diseases_gin" ON "chunks" USING gin ("diseases");