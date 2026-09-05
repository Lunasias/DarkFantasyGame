CREATE TABLE "character_quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"quest_id" text NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "character_quests_status_valid" CHECK ("character_quests"."status" IN ('accepted','completed'))
);
--> statement-breakpoint
CREATE TABLE "quest_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"quest_id" text NOT NULL,
	"objective_id" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quest_progress_non_negative" CHECK ("quest_progress"."progress" >= 0)
);
--> statement-breakpoint
CREATE TABLE "world_event_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"outcome" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_event_claims_outcome_valid" CHECK ("world_event_claims"."outcome" IN ('success','missed'))
);
--> statement-breakpoint
CREATE TABLE "dungeon_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"dungeon_id" text NOT NULL,
	"status" text DEFAULT 'entered' NOT NULL,
	"encounter" integer DEFAULT 0 NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "dungeon_entries_status_valid" CHECK ("dungeon_entries"."status" IN ('entered','completed')),
	CONSTRAINT "dungeon_entries_encounter_non_negative" CHECK ("dungeon_entries"."encounter" >= 0)
);
--> statement-breakpoint
ALTER TABLE "character_quests" ADD CONSTRAINT "character_quests_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_progress" ADD CONSTRAINT "quest_progress_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_event_claims" ADD CONSTRAINT "world_event_claims_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dungeon_entries" ADD CONSTRAINT "dungeon_entries_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "character_quests_character_id_idx" ON "character_quests" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "character_quests_character_quest_unique" ON "character_quests" USING btree ("character_id","quest_id");--> statement-breakpoint
CREATE INDEX "quest_progress_character_id_idx" ON "quest_progress" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quest_progress_character_quest_objective_unique" ON "quest_progress" USING btree ("character_id","quest_id","objective_id");--> statement-breakpoint
CREATE INDEX "world_event_claims_character_id_idx" ON "world_event_claims" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "world_event_claims_character_event_unique" ON "world_event_claims" USING btree ("character_id","event_id");--> statement-breakpoint
CREATE INDEX "dungeon_entries_character_id_idx" ON "dungeon_entries" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dungeon_entries_character_dungeon_unique" ON "dungeon_entries" USING btree ("character_id","dungeon_id");