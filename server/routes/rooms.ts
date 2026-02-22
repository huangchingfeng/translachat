import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { rooms, messages } from '../db/schema.js';
import { eq, desc, and, lt } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// 所有路由都需要驗證
router.use(authMiddleware);

// GET / - 列出 host 的所有房間，包含最後一則訊息預覽
router.get('/', (req, res) => {
  const hostId = req.authUser!.id;

  const allRooms = db
    .select()
    .from(rooms)
    .where(eq(rooms.hostId, hostId))
    .orderBy(desc(rooms.updatedAt))
    .all();

  const result = allRooms.map((room) => {
    const lastMessage = db
      .select()
      .from(messages)
      .where(eq(messages.roomId, room.id))
      .orderBy(desc(messages.createdAt))
      .limit(1)
      .get();

    return {
      ...room,
      chatUrl: `/chat/${room.slug}`,
      lastMessage: lastMessage || null,
    };
  });

  return res.json(result);
});

// POST / - 建立新房間
router.post('/', (req, res) => {
  const hostId = req.authUser!.id;
  const { label, hostLang } = req.body;

  if (!label) {
    return res.status(400).json({ message: '請提供房間名稱' });
  }

  const slug = nanoid(12);

  const result = db
    .insert(rooms)
    .values({
      slug,
      hostId,
      label,
      hostLang: hostLang || 'zh-TW',
    })
    .returning()
    .get();

  return res.status(201).json({
    ...result,
    chatUrl: `/chat/${slug}`,
  });
});

// PATCH /:id - 更新房間
router.patch('/:id', (req, res) => {
  const hostId = req.authUser!.id;
  const roomId = Number(req.params.id);
  const { label, status } = req.body;

  const room = db
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, roomId), eq(rooms.hostId, hostId)))
    .get();

  if (!room) {
    return res.status(404).json({ message: '找不到此房間' });
  }

  const updates: Record<string, string> = {};
  if (label) updates.label = label;
  if (status) updates.status = status;

  const updated = db
    .update(rooms)
    .set({ ...updates, updatedAt: new Date().toISOString() })
    .where(eq(rooms.id, roomId))
    .returning()
    .get();

  return res.json(updated);
});

// DELETE /:id - 刪除房間及所有訊息
router.delete('/:id', (req, res) => {
  const hostId = req.authUser!.id;
  const roomId = Number(req.params.id);

  const room = db
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, roomId), eq(rooms.hostId, hostId)))
    .get();

  if (!room) {
    return res.status(404).json({ message: '找不到此房間' });
  }

  // 先刪訊息，再刪房間
  db.delete(messages).where(eq(messages.roomId, roomId)).run();
  db.delete(rooms).where(eq(rooms.id, roomId)).run();

  return res.json({ message: '房間已刪除' });
});

// GET /:id/messages - 取得房間訊息（分頁）
router.get('/:id/messages', (req, res) => {
  const hostId = req.authUser!.id;
  const roomId = Number(req.params.id);
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const before = req.query.before ? Number(req.query.before) : undefined;

  const room = db
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, roomId), eq(rooms.hostId, hostId)))
    .get();

  if (!room) {
    return res.status(404).json({ message: '找不到此房間' });
  }

  const conditions = [eq(messages.roomId, roomId)];
  if (before) {
    conditions.push(lt(messages.id, before));
  }

  const result = db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.id))
    .limit(limit)
    .all();

  return res.json(result);
});

export default router;
