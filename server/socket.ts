import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
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

// Guest 連線計數：roomSlug -> Set<socketId>
const roomGuestSockets = new Map<string, Set<string>>();

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 1000; // 1 秒
const MAX_MESSAGE_LENGTH = 2000;

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

  // === Socket.io 連線驗證 middleware ===
  io.use((socket, next) => {
    const { token, roomSlug } = socket.handshake.auth;

    // Host 連線：驗證 JWT token
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: number; email: string; name: string };
        (socket.data as any).role = 'host';
        (socket.data as any).hostId = decoded.id;
        return next();
      } catch {
        return next(new Error('JWT 驗證失敗'));
      }
    }

    // Guest 連線：驗證 roomSlug 存在
    if (roomSlug) {
      const room = db.select().from(rooms).where(eq(rooms.slug, roomSlug)).get();
      if (!room) {
        return next(new Error('聊天室不存在'));
      }
      (socket.data as any).role = 'guest';
      (socket.data as any).roomSlug = roomSlug;
      return next();
    }

    return next(new Error('缺少驗證資訊'));
  });

  io.on('connection', (socket) => {
    const authenticatedRole: 'host' | 'guest' = (socket.data as any).role;
    console.log(`[Socket] Connected: ${socket.id} (${authenticatedRole})`);

    // === room:join ===
    socket.on('room:join', async ({ slug }) => {
      // Server 決定 role，不信任 client 傳來的值
      const role = authenticatedRole;

      try {
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
          guestLang: room.guestLang || 'th',
        });

        // 通知房間其他人此用戶上線
        socket.to(slug).emit('user:online', { role });

        // 訪客上線通知（保留舊事件相容）
        if (role === 'guest') {
          io.to(slug).emit('guest:online', { isOnline: true });

          // 追蹤 guest 連線數
          if (!roomGuestSockets.has(slug)) {
            roomGuestSockets.set(slug, new Set());
          }
          roomGuestSockets.get(slug)!.add(socket.id);

          // 通知 host 目前 guest 數量
          const guestCount = roomGuestSockets.get(slug)!.size;
          io.to(slug).emit('room:guest-count', { count: guestCount });
        }

        console.log(`[Socket] ${role} joined room: ${slug}`);
      } catch (error) {
        console.error('[Socket] room:join error:', error);
        socket.emit('message:error', { error: '加入聊天室失敗，請重試' });
      }
    });

    // === message:send ===
    socket.on('message:send', async ({ text, sourceLang }) => {
      const info = socketRooms.get(socket.id);
      if (!info) return;

      // 訊息長度限制
      if (!text || text.length > MAX_MESSAGE_LENGTH) {
        socket.emit('message:error', { error: `訊息長度不得超過 ${MAX_MESSAGE_LENGTH} 字元` });
        return;
      }

      // 速率限制
      if (!checkRateLimit(socket.id)) {
        socket.emit('message:error', { error: '發送太頻繁，請稍候' });
        return;
      }

      const { slug, role } = info;

      try {
        // 取得房間資訊
        const room = db.select().from(rooms).where(eq(rooms.slug, slug)).get();
        if (!room) return;

        // 決定來源語言和目標語言
        const actualSourceLang = sourceLang || (role === 'host' ? (room.hostLang || 'zh-TW') : (room.guestLang || 'th'));
        const targetLang = role === 'host' ? (room.guestLang || 'th') : (room.hostLang || 'zh-TW');

        // 翻譯
        const translatedText = await translate(text, actualSourceLang, targetLang);

        // 寫入資料庫
        const result = db.insert(messages).values({
          roomId: room.id,
          sender: role,
          originalText: text,
          translatedText,
          sourceLang: actualSourceLang,
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
      } catch (error) {
        console.error('[Socket] message:send error:', error);
        socket.emit('message:error', { error: '訊息發送失敗，請重試' });
      }
    });

    // === guest:setName ===
    socket.on('guest:setName', async ({ name }) => {
      const info = socketRooms.get(socket.id);
      if (!info || info.role !== 'guest') return;

      try {
        db.update(rooms)
          .set({ guestName: name, updatedAt: new Date().toISOString() })
          .where(eq(rooms.slug, info.slug))
          .run();

        console.log(`[Socket] Guest set name: ${name} in room ${info.slug}`);
      } catch (error) {
        console.error('[Socket] guest:setName error:', error);
        socket.emit('message:error', { error: '設定名稱失敗' });
      }
    });

    // === language:change ===
    socket.on('language:change', async ({ lang }) => {
      const info = socketRooms.get(socket.id);
      if (!info) return;

      const { slug, role } = info;

      try {
        // 更新資料庫
        if (role === 'host') {
          db.update(rooms).set({ hostLang: lang }).where(eq(rooms.slug, slug)).run();
        } else {
          db.update(rooms).set({ guestLang: lang }).where(eq(rooms.slug, slug)).run();
        }

        // 通知房間
        io.to(slug).emit('language:changed', { lang, role });
      } catch (error) {
        console.error('[Socket] language:change error:', error);
        socket.emit('message:error', { error: '語言切換失敗' });
      }
    });

    // === typing:start ===
    socket.on('typing:start', ({ roomSlug }) => {
      const info = socketRooms.get(socket.id);
      if (!info) return;

      const slug = roomSlug || info.slug;

      // 通用 typing:indicator（保留舊事件相容）
      socket.to(slug).emit('typing:indicator', { sender: info.role, isTyping: true });

      // 角色專屬 typing 事件
      if (info.role === 'host') {
        socket.to(slug).emit('host:typing', { isTyping: true });
      } else {
        socket.to(slug).emit('guest:typing', { isTyping: true });
      }
    });

    // === typing:stop ===
    socket.on('typing:stop', ({ roomSlug }) => {
      const info = socketRooms.get(socket.id);
      if (!info) return;

      const slug = roomSlug || info.slug;

      // 通用 typing:indicator（保留舊事件相容）
      socket.to(slug).emit('typing:indicator', { sender: info.role, isTyping: false });

      // 角色專屬 typing 事件
      if (info.role === 'host') {
        socket.to(slug).emit('host:typing', { isTyping: false });
      } else {
        socket.to(slug).emit('guest:typing', { isTyping: false });
      }
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

      // 通知房間其他人此用戶離線
      io.to(slug).emit('user:offline', { role });

      // 訪客離線通知
      if (role === 'guest') {
        // 更新 guest 連線計數
        const guestSet = roomGuestSockets.get(slug);
        if (guestSet) {
          guestSet.delete(socket.id);
          const guestCount = guestSet.size;

          // 通知 host 目前 guest 數量
          io.to(slug).emit('room:guest-count', { count: guestCount });

          // 如果沒有 guest 了，發送離線通知並清理
          if (guestCount === 0) {
            io.to(slug).emit('guest:online', { isOnline: false });
            roomGuestSockets.delete(slug);
          }
        } else {
          io.to(slug).emit('guest:online', { isOnline: false });
        }
      }

      console.log(`[Socket] ${role} left room: ${slug}`);
    });
  });
}
