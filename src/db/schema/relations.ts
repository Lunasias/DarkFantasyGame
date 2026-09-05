import { relations } from "drizzle-orm";
import { characters } from "./characters";
import { gameEvents } from "./game-events";
import { gameSessions } from "./game-sessions";
import { playerProfiles } from "./player-profiles";
import { roomPlayers } from "./room-players";
import { rooms } from "./rooms";
import { turns } from "./turns";
import { users } from "./users";

/**
 * Query-builder relations (relational joins available through Drizzle). These
 * describe traversal relationships only — the physical foreign keys live on the
 * table definitions above.
 */
export const usersRelations = relations(users, ({ one, many }) => ({
  playerProfile: one(playerProfiles, {
    fields: [users.id],
    references: [playerProfiles.userId],
  }),
  hostedRooms: many(rooms),
  roomMemberships: many(roomPlayers),
}));

export const playerProfilesRelations = relations(
  playerProfiles,
  ({ one, many }) => ({
    user: one(users, {
      fields: [playerProfiles.userId],
      references: [users.id],
    }),
    characters: many(characters),
  }),
);

export const charactersRelations = relations(characters, ({ one }) => ({
  profile: one(playerProfiles, {
    fields: [characters.profileId],
    references: [playerProfiles.id],
  }),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  host: one(users, {
    fields: [rooms.hostUserId],
    references: [users.id],
  }),
  members: many(roomPlayers),
  sessions: many(gameSessions),
}));

export const roomPlayersRelations = relations(roomPlayers, ({ one }) => ({
  room: one(rooms, {
    fields: [roomPlayers.roomId],
    references: [rooms.id],
  }),
  user: one(users, {
    fields: [roomPlayers.userId],
    references: [users.id],
  }),
}));

export const gameSessionsRelations = relations(
  gameSessions,
  ({ one, many }) => ({
    room: one(rooms, {
      fields: [gameSessions.roomId],
      references: [rooms.id],
    }),
    turns: many(turns),
    events: many(gameEvents),
  }),
);

export const turnsRelations = relations(turns, ({ one }) => ({
  session: one(gameSessions, {
    fields: [turns.gameSessionId],
    references: [gameSessions.id],
  }),
}));

export const gameEventsRelations = relations(gameEvents, ({ one }) => ({
  session: one(gameSessions, {
    fields: [gameEvents.gameSessionId],
    references: [gameSessions.id],
  }),
}));
