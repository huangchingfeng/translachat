import 'dotenv/config';

import express from 'express';
import cors from 'cors';
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

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/chat', chatRouter);

// Production: 靜態檔案 & SPA fallback
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../dist/client');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = createServer(app);
setupSocket(server);

const PORT = process.env.PORT || 3000;

await initDB();

server.listen(PORT, () => {
  console.log(`TranslaChat server running on port ${PORT}`);
});
