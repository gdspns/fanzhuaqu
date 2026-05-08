import { pgTable, text, bigint, integer, serial, uniqueIndex } from "drizzle-orm/pg-core";

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  token: text("token").notNull().unique(),
  expireAt: bigint("expire_at", { mode: "number" }).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  maxDevices: integer("max_devices").notNull().default(0),
});

export const subscriptionDevices = pgTable("subscription_devices", {
  id: serial("id").primaryKey(),
  token: text("token").notNull(),
  ip: text("ip").notNull(),
  firstSeen: bigint("first_seen", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("token_ip_idx").on(table.token, table.ip),
]);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
