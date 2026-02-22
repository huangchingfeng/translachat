import 'dotenv/config';

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

import authRouter from './routes/auth.js';
import roomsRouter from './routes/rooms.js';
import chatRouter from './routes/chat.js';
import { setupSocket } from './socket.js';
import { initDB } from './db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// CORS origin 設定
function getCorsOrigin(): string | string[] {
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  if (allowedOrigins) {
    return allowedOrigins.split(',').map(s => s.trim());
  }
  if (process.env.NODE_ENV === 'production') {
    console.warn('[CORS] ALLOWED_ORIGINS 未設定，production 環境使用 "*" 並不安全');
    return '*';
  }
  return 'http://localhost:5173';
}

// Middleware
app.use(helmet());
app.use(cors({ origin: getCorsOrigin() }));
app.use(express.json());

// Health check（放在 API 路由之前）
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/chat', chatRouter);

// Production: 靜態檔案 & SPA fallback（排除 /api/ 路徑）
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../dist/client');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'API route not found' });
      return;
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Global error handler（放在所有路由之後）
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = createServer(app);
setupSocket(server);

const PORT = process.env.PORT || 3000;

// 啟動前環境變數驗證
if (!process.env.JWT_SECRET) {
  console.warn('[Startup] WARNING: JWT_SECRET is not set. Auth will not work properly.');
}
if (!process.env.GEMINI_API_KEY) {
  console.warn('[Startup] WARNING: GEMINI_API_KEY is not set. Translation will not work.');
}

await initDB();

server.listen(PORT, () => {
  console.log(`TranslaChat server running on port ${PORT}`);
});
