import { Router } from 'express';
import { db } from '../db/index.js';
import { rooms, messages, hosts } from '../db/schema.js';
import { eq, desc, lt, and } from 'drizzle-orm';

const router = Router();

// GET /api/chat/:slug — 取得聊天室資訊（訪客用）
router.get('/:slug', (req, res) => {
  const { slug } = req.params;

  const room = db
    .select({
      slug: rooms.slug,
      guestName: rooms.guestName,
      guestLang: rooms.guestLang,
      hostLang: rooms.hostLang,
      status: rooms.status,
      hostName: hosts.name,
    })
    .from(rooms)
    .innerJoin(hosts, eq(rooms.hostId, hosts.id))
    .where(eq(rooms.slug, slug))
    .get();

  if (!room || room.status === 'archived') {
    return res.status(404).json({ message: '聊天室不存在或已關閉' });
  }

  return res.json({
    slug: room.slug,
    hostName: room.hostName,
    guestName: room.guestName,
    guestLang: room.guestLang,
    hostLang: room.hostLang,
  });
});

// PATCH /api/chat/:slug/guest — 更新訪客資訊
router.patch('/:slug/guest', (req, res) => {
  const { slug } = req.params;
  const { guestName, guestLang } = req.body;

  const room = db.select().from(rooms).where(eq(rooms.slug, slug)).get();

  if (!room) {
    return res.status(404).json({ message: '聊天室不存在' });
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (guestName !== undefined) updates.guestName = guestName;
  if (guestLang !== undefined) updates.guestLang = guestLang;

  db.update(rooms).set(updates).where(eq(rooms.slug, slug)).run();

  // 重新查詢回傳更新後的資訊
  const updated = db
    .select({
      slug: rooms.slug,
      guestName: rooms.guestName,
      guestLang: rooms.guestLang,
      hostLang: rooms.hostLang,
      hostName: hosts.name,
    })
    .from(rooms)
    .innerJoin(hosts, eq(rooms.hostId, hosts.id))
    .where(eq(rooms.slug, slug))
    .get();

  return res.json({
    slug: updated!.slug,
    hostName: updated!.hostName,
    guestName: updated!.guestName,
    guestLang: updated!.guestLang,
    hostLang: updated!.hostLang,
  });
});

// GET /api/chat/:slug/messages — 取得聊天訊息（支援分頁）
router.get('/:slug/messages', (req, res) => {
  const { slug } = req.params;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const before = req.query.before ? Number(req.query.before) : undefined;

  const room = db.select().from(rooms).where(eq(rooms.slug, slug)).get();

  if (!room) {
    return res.status(404).json({ message: '聊天室不存在' });
  }

  const conditions = [eq(messages.roomId, room.id)];
  if (before !== undefined) {
    conditions.push(lt(messages.id, before));
  }

  const result = db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit)
    .all();

  // 反轉為時間順序
  return res.json(result.reverse());
});

export default router;
