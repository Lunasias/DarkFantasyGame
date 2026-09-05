ALTER TABLE "characters" ADD COLUMN "job_id" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "experience" integer DEFAULT 0 NOT NULL;