import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { hosts } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

// POST /login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const host = db.select().from(hosts).where(eq(hosts.email, email)).get();

  if (!host) {
    return res.status(401).json({ message: '帳號或密碼錯誤' });
  }

  const valid = bcrypt.compareSync(password, host.password);
  if (!valid) {
    return res.status(401).json({ message: '帳號或密碼錯誤' });
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
