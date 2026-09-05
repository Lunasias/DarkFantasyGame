CREATE TYPE "public"."room_status" AS ENUM('waiting', 'starting', 'in_game', 'finished', 'closed');--> statement-breakpoint
CREATE TYPE "public"."room_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."session_phase" AS ENUM('lobby', 'active', 'finished');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "player_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"player_name" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"total_gold" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archetype" text DEFAULT 'adventurer' NOT NULL,
	"job_id" text,
	"level" integer DEFAULT 1 NOT NULL,
	"experience" integer DEFAULT 0 NOT NULL,
	"gold" integer DEFAULT 100 NOT NULL,
	"health" integer NOT NULL,
	"max_health" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_gold_non_negative" CHECK ("characters"."gold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"stackable" boolean DEFAULT false NOT NULL,
	"slot" text,
	"modifiers" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"equipped_slot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_inventory_quantity_non_negative" CHECK ("character_inventory"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" text NOT NULL,
	"item_id" text NOT NULL,
	"buy_price" integer NOT NULL,
	"sell_price" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "board_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_session_id" uuid NOT NULL,
	"character_id" text NOT NULL,
	"node_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "combats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_session_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"active_combatant" text,
	"winner" text,
	"combat_turn" integer DEFAULT 0 NOT NULL,
	"state_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "combat_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"combat_id" uuid NOT NULL,
	"character_id" text NOT NULL,
	"hp" integer NOT NULL,
	"max_hp" integer NOT NULL,
	"attack" integer NOT NULL,
	"defense" integer NOT NULL,
	"alive" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_code" text NOT NULL,
	"name" text NOT NULL,
	"host_user_id" uuid NOT NULL,
	"status" "room_status" DEFAULT 'waiting' NOT NULL,
	"max_players" integer DEFAULT 4 NOT NULL,
	"game_mode" text DEFAULT 'standard' NOT NULL,
	"ruleset" text DEFAULT 'classic' NOT NULL,
	"visibility" "room_visibility" DEFAULT 'public' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_id" uuid,
	"slot" integer NOT NULL,
	"ready" boolean DEFAULT false NOT NULL,
	"is_host" boolean DEFAULT false NOT NULL,
	"connected" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid,
	"phase" "session_phase" DEFAULT 'lobby' NOT NULL,
	"current_turn_number" integer DEFAULT 0 NOT NULL,
	"state_version" integer DEFAULT 0 NOT NULL,
	"config" jsonb,
	"started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_session_id" uuid NOT NULL,
	"turn_number" integer NOT NULL,
	"player_id" uuid,
	"state" jsonb,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"actor_id" uuid,
	"type" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_session_id" uuid NOT NULL,
	"actor_id" uuid,
	"type" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_profile_id_player_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_inventory" ADD CONSTRAINT "character_inventory_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_inventory" ADD CONSTRAINT "character_inventory_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_inventory" ADD CONSTRAINT "shop_inventory_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_inventory" ADD CONSTRAINT "shop_inventory_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_quests" ADD CONSTRAINT "character_quests_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_progress" ADD CONSTRAINT "quest_progress_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_event_claims" ADD CONSTRAINT "world_event_claims_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dungeon_entries" ADD CONSTRAINT "dungeon_entries_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_positions" ADD CONSTRAINT "board_positions_game_session_id_game_sessions_id_fk" FOREIGN KEY ("game_session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combats" ADD CONSTRAINT "combats_game_session_id_game_sessions_id_fk" FOREIGN KEY ("game_session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combat_participants" ADD CONSTRAINT "combat_participants_combat_id_combats_id_fk" FOREIGN KEY ("combat_id") REFERENCES "public"."combats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_profile_id_player_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."player_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_game_session_id_game_sessions_id_fk" FOREIGN KEY ("game_session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_events" ADD CONSTRAINT "room_events_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_events" ADD CONSTRAINT "room_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_game_session_id_game_sessions_id_fk" FOREIGN KEY ("game_session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "player_profiles_user_id_idx" ON "player_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_profiles_user_id_unique" ON "player_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "characters_profile_id_idx" ON "characters" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "character_inventory_character_id_idx" ON "character_inventory" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "character_inventory_character_item_unique" ON "character_inventory" USING btree ("character_id","item_id");--> statement-breakpoint
CREATE INDEX "shop_inventory_shop_id_idx" ON "shop_inventory" USING btree ("shop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_inventory_shop_item_unique" ON "shop_inventory" USING btree ("shop_id","item_id");--> statement-breakpoint
CREATE INDEX "reward_claims_character_id_idx" ON "reward_claims" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_claims_character_reward_unique" ON "reward_claims" USING btree ("character_id","reward_key");--> statement-breakpoint
CREATE INDEX "character_quests_character_id_idx" ON "character_quests" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "character_quests_character_quest_unique" ON "character_quests" USING btree ("character_id","quest_id");--> statement-breakpoint
CREATE INDEX "quest_progress_character_id_idx" ON "quest_progress" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quest_progress_character_quest_objective_unique" ON "quest_progress" USING btree ("character_id","quest_id","objective_id");--> statement-breakpoint
CREATE INDEX "world_event_claims_character_id_idx" ON "world_event_claims" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "world_event_claims_character_event_unique" ON "world_event_claims" USING btree ("character_id","event_id");--> statement-breakpoint
CREATE INDEX "dungeon_entries_character_id_idx" ON "dungeon_entries" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dungeon_entries_character_dungeon_unique" ON "dungeon_entries" USING btree ("character_id","dungeon_id");--> statement-breakpoint
CREATE INDEX "board_positions_game_session_id_idx" ON "board_positions" USING btree ("game_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "board_positions_session_character_unique" ON "board_positions" USING btree ("game_session_id","character_id");--> statement-breakpoint
CREATE INDEX "combats_game_session_id_idx" ON "combats" USING btree ("game_session_id");--> statement-breakpoint
CREATE INDEX "combat_participants_combat_id_idx" ON "combat_participants" USING btree ("combat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "combat_participants_combat_character_unique" ON "combat_participants" USING btree ("combat_id","character_id");--> statement-breakpoint
CREATE INDEX "rooms_host_user_id_idx" ON "rooms" USING btree ("host_user_id");--> statement-breakpoint
CREATE INDEX "rooms_status_idx" ON "rooms" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_room_code_unique" ON "rooms" USING btree ("room_code");--> statement-breakpoint
CREATE INDEX "room_players_room_id_idx" ON "room_players" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "room_players_user_id_idx" ON "room_players" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "room_players_room_user_unique" ON "room_players" USING btree ("room_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "room_players_room_slot_unique" ON "room_players" USING btree ("room_id","slot");--> statement-breakpoint
CREATE INDEX "game_sessions_room_id_idx" ON "game_sessions" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "turns_game_session_id_idx" ON "turns" USING btree ("game_session_id");--> statement-breakpoint
CREATE INDEX "room_events_room_id_idx" ON "room_events" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "room_events_room_sequence_unique" ON "room_events" USING btree ("room_id","sequence");--> statement-breakpoint
CREATE INDEX "game_events_game_session_id_idx" ON "game_events" USING btree ("game_session_id");