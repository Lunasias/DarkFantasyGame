CREATE TYPE "public"."room_visibility" AS ENUM('public', 'private');--> statement-breakpoint
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
ALTER TABLE "rooms" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "rooms" ALTER COLUMN "status" SET DEFAULT 'waiting'::text;--> statement-breakpoint
DROP TYPE "public"."room_status";--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('waiting', 'starting', 'in_game', 'finished', 'closed');--> statement-breakpoint
ALTER TABLE "rooms" ALTER COLUMN "status" SET DEFAULT 'waiting'::"public"."room_status";--> statement-breakpoint
ALTER TABLE "rooms" ALTER COLUMN "status" SET DATA TYPE "public"."room_status" USING "status"::"public"."room_status";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "display_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "room_code" text NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "game_mode" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "ruleset" text DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "visibility" "room_visibility" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "room_players" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "room_players" ADD COLUMN "slot" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "room_players" ADD COLUMN "connected" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "room_players" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "state_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_events" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_events" ADD CONSTRAINT "room_events_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_events" ADD CONSTRAINT "room_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "room_events_room_id_idx" ON "room_events" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "room_events_room_sequence_unique" ON "room_events" USING btree ("room_id","sequence");--> statement-breakpoint
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_profile_id_player_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."player_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rooms_status_idx" ON "rooms" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_room_code_unique" ON "rooms" USING btree ("room_code");--> statement-breakpoint
CREATE UNIQUE INDEX "room_players_room_slot_unique" ON "room_players" USING btree ("room_id","slot");