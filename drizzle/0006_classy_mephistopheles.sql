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
ALTER TABLE "board_positions" ADD CONSTRAINT "board_positions_game_session_id_game_sessions_id_fk" FOREIGN KEY ("game_session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combats" ADD CONSTRAINT "combats_game_session_id_game_sessions_id_fk" FOREIGN KEY ("game_session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combat_participants" ADD CONSTRAINT "combat_participants_combat_id_combats_id_fk" FOREIGN KEY ("combat_id") REFERENCES "public"."combats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_positions_game_session_id_idx" ON "board_positions" USING btree ("game_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "board_positions_session_character_unique" ON "board_positions" USING btree ("game_session_id","character_id");--> statement-breakpoint
CREATE INDEX "combats_game_session_id_idx" ON "combats" USING btree ("game_session_id");--> statement-breakpoint
CREATE INDEX "combat_participants_combat_id_idx" ON "combat_participants" USING btree ("combat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "combat_participants_combat_character_unique" ON "combat_participants" USING btree ("combat_id","character_id");