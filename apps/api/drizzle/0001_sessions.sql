CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"status" text NOT NULL,
	"case_id" text,
	"state" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_active" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sessions_phone_idx" ON "sessions" ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_one_open_per_phone_idx" ON "sessions" ("phone") WHERE "sessions"."status" = 'open';
