CREATE TABLE "farmers" (
	"phone" text PRIMARY KEY NOT NULL,
	"name" text,
	"state" text,
	"lga" text,
	"farm_size" integer,
	"species" text,
	"preferred_lang" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "farmers_phone_idx" ON "farmers" ("phone");
