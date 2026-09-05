ALTER TABLE "characters" ADD COLUMN "mana" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "combat_participants" ADD COLUMN "cooldowns" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_mana_non_negative" CHECK ("characters"."mana" >= 0);