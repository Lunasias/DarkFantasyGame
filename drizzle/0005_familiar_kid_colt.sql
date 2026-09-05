CREATE TABLE "reward_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"reward_key" text NOT NULL,
	"source" text NOT NULL,
	"experience" integer DEFAULT 0 NOT NULL,
	"gold" integer DEFAULT 0 NOT NULL,
	"items" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_claims_experience_non_negative" CHECK ("reward_claims"."experience" >= 0),
	CONSTRAINT "reward_claims_gold_non_negative" CHECK ("reward_claims"."gold" >= 0)
);
--> statement-breakpoint
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reward_claims_character_id_idx" ON "reward_claims" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_claims_character_reward_unique" ON "reward_claims" USING btree ("character_id","reward_key");