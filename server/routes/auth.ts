import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db/index.js';
import { hosts } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

// 登入速率限制：每個 IP 每分鐘最多 5 次
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '登入嘗試太頻繁，請稍後再試' },
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

// POST /login
router.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { email, password } = parsed.data;

  const host = db.select().from(hosts).where(eq(hosts.email, email)).get();

  if (!host) {
    return res.status(401).json({ error: '帳號或密碼錯誤' });
  }

  const valid = bcrypt.compareSync(password, host.password);
  if (!valid) {
    return res.status(401).json({ error: '帳號或密碼錯誤' });
  }

  const token = jwt.sign(
    { id: host.id, email: host.email, name: host.name },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );

  return res.json({
    token,
    host: { id: host.id, name: host.name, email: host.email },
  });
});

// POST /logout
router.post('/logout', (_req, res) => {
  return res.json({ message: '已登出' });
});

export default router;
