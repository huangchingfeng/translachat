import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { count, eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as schema from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');

// 確保 data 目錄存在
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'translachat.db');
const sqlite = new Database(dbPath);

// 啟用 WAL 模式，提升並發讀取效能
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

// 初始化資料表
export function initTables() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS hosts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      language TEXT DEFAULT 'zh-TW',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      host_id INTEGER NOT NULL REFERENCES hosts(id),
      label TEXT NOT NULL,
      guest_name TEXT,
      guest_lang TEXT DEFAULT 'th',
      host_lang TEXT DEFAULT 'zh-TW',
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL REFERENCES rooms(id),
      sender TEXT NOT NULL,
      original_text TEXT NOT NULL,
      translated_text TEXT,
      source_lang TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_rooms_host_id ON rooms(host_id);
    CREATE INDEX IF NOT EXISTS idx_rooms_slug ON rooms(slug);
  `);
}

// 建立或更新預設 host 帳號
export async function seedHost() {
  const email = process.env.HOST_EMAIL || 'admin@translachat.com';
  const password = process.env.HOST_PASSWORD || 'changeme';
  const name = process.env.HOST_NAME || 'Host';

  const hashedPassword = await bcrypt.hash(password, 10);

  const result = db.select({ value: count() }).from(schema.hosts).get();
  if (result && result.value > 0) {
    // 更新第一個 host 帳號，確保與環境變數同步
    const firstHost = db.select().from(schema.hosts).get();
    if (firstHost && firstHost.email !== email) {
      db.update(schema.hosts)
        .set({ email, password: hashedPassword, name })
        .where(eq(schema.hosts.id, firstHost.id))
        .run();
      console.log(`[DB] Updated host: ${email}`);
    }
    return;
  }

  db.insert(schema.hosts).values({
    email,
    password: hashedPassword,
    name,
  }).run();

  console.log(`[DB] Seeded host: ${email}`);
}

// 初始化：建表 + 種子資料
export async function initDB() {
  initTables();
  await seedHost();
  console.log('[DB] Database initialized');
}
