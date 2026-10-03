import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const rooms = sqliteTable("game_rooms", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(0),
  data: text("data").notNull(),
  updated: integer("updated").notNull(),
});
