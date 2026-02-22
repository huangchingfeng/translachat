import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const hosts = sqliteTable('hosts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').unique().notNull(),
  password: text('password').notNull(),
  name: text('name').notNull(),
  language: text('language').default('zh-TW'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const rooms = sqliteTable('rooms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').unique().notNull(),
  hostId: integer('host_id').notNull().references(() => hosts.id),
  label: text('label').notNull(),
  guestName: text('guest_name'),
  guestLang: text('guest_lang').default('en'),
  hostLang: text('host_lang').default('zh-TW'),
  status: text('status').default('active'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomId: integer('room_id').notNull().references(() => rooms.id),
  sender: text('sender').notNull(),
  originalText: text('original_text').notNull(),
  translatedText: text('translated_text'),
  sourceLang: text('source_lang').notNull(),
  targetLang: text('target_lang').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});
