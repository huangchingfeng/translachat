import { Server } from 'socket.io';
import { db } from './db/index.js';
import { rooms, messages } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { translate } from './services/translator.js';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types.js';

// 房間連線追蹤：slug -> { host socketId, guest socketId }
const roomConnections = new Map<string, { host?: string; guest?: string }>();

// socket -> 房間對應：socketId -> { slug, role }
const socketRooms = new Map<string, { slug: string; role: 'host' | 'guest' }>();

// 訊息速率限制：socketId -> timestamps[]
const rateLimits = new Map<string, number[]>();

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 1000; // 1 秒

function checkRateLimit(socketId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimits.get(socketId) || [];

  // 過濾掉超過 1 秒的記錄
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
  recent.push(now);
  rateLimits.set(socketId, recent);

  return recent.length <= RATE_LIMIT_MAX;
}

export function setupSocket(httpServer: any): void {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: '*' },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // === room:join ===
    socket.on('room:join', async ({ slug, role }) => {
      // 查詢房間
      const room = db.select().from(rooms).where(eq(rooms.slug, slug)).get();

      if (!room) {
        socket.emit('message:error', { error: '聊天室不存在' });
        return;
      }

      // 加入 socket.io room channel
      socket.join(slug);

      // 追蹤連線
      const conn = roomConnections.get(slug) || {};
      conn[role] = socket.id;
      roomConnections.set(slug, conn);

      socketRooms.set(socket.id, { slug, role });

      // 通知加入成功
      socket.emit('room:joined', {
        roomId: room.id,
        hostLang: room.hostLang || 'zh-TW',
        guestLang: room.guestLang || 'en',
      });

      // 訪客上線通知
      if (role === 'guest') {
        io.to(slug).emit('guest:online', { isOnline: true });
      }

      console.log(`[Socket] ${role} joined room: ${slug}`);
    });

    // === message:send ===
    socket.on('message:send', async ({ text, sourceLang }) => {
      const info = socketRooms.get(socket.id);
      if (!info) return;

      // 速率限制
      if (!checkRateLimit(socket.id)) {
        socket.emit('message:error', { error: '發送太頻繁，請稍候' });
        return;
      }

      const { slug, role } = info;

      // 取得房間資訊
      const room = db.select().from(rooms).where(eq(rooms.slug, slug)).get();
      if (!room) return;

      // 決定目標語言
      const targetLang = role === 'host' ? (room.guestLang || 'en') : (room.hostLang || 'zh-TW');

      // 翻譯
      const translatedText = await translate(text, sourceLang, targetLang);

      // 寫入資料庫
      const result = db.insert(messages).values({
        roomId: room.id,
        sender: role,
        originalText: text,
        translatedText,
        sourceLang,
        targetLang,
      }).run();

      // 更新房間 updatedAt
      db.update(rooms)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(rooms.id, room.id))
        .run();

      // 取得插入的訊息（含 id 和 createdAt）
      const insertedId = Number(result.lastInsertRowid);
      const inserted = db.select().from(messages).where(eq(messages.id, insertedId)).get();

      if (inserted) {
        io.to(slug).emit('message:new', inserted as any);
      }
    });

    // === language:change ===
    socket.on('language:change', async ({ lang }) => {
      const info = socketRooms.get(socket.id);
      if (!info) return;

      const { slug, role } = info;

      // 更新資料庫
      if (role === 'host') {
        db.update(rooms).set({ hostLang: lang }).where(eq(rooms.slug, slug)).run();
      } else {
        db.update(rooms).set({ guestLang: lang }).where(eq(rooms.slug, slug)).run();
      }

      // 通知房間
      io.to(slug).emit('language:changed', { lang, role });
    });

    // === typing:start ===
    socket.on('typing:start', () => {
      const info = socketRooms.get(socket.id);
      if (!info) return;

      socket.to(info.slug).emit('typing:indicator', { sender: info.role });
    });

    // === typing:stop ===
    socket.on('typing:stop', () => {
      const info = socketRooms.get(socket.id);
      if (!info) return;

      socket.to(info.slug).emit('typing:indicator', { sender: info.role });
    });

    // === disconnect ===
    socket.on('disconnect', () => {
      const info = socketRooms.get(socket.id);
      if (!info) {
        console.log(`[Socket] Disconnected: ${socket.id}`);
        return;
      }

      const { slug, role } = info;

      // 清理 roomConnections
      const conn = roomConnections.get(slug);
      if (conn) {
        if (conn[role] === socket.id) {
          delete conn[role];
        }
        // 如果房間沒有人了，清理整個記錄
        if (!conn.host && !conn.guest) {
          roomConnections.delete(slug);
        }
      }

      // 清理 socketRooms
      socketRooms.delete(socket.id);

      // 清理速率限制
      rateLimits.delete(socket.id);

      // 訪客離線通知
      if (role === 'guest') {
        io.to(slug).emit('guest:online', { isOnline: false });
      }

      console.log(`[Socket] ${role} left room: ${slug}`);
    });
  });
}
