import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');
const tmpDir = path.join(dataDir, 'tmp');

// 確保暫存目錄存在
fs.mkdirSync(tmpDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tmpDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.webm';
    const name = `whisper-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = /^audio\/(webm|mp4|ogg|wav|mpeg|mp3|m4a|flac)$/;
    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支援的音檔格式'));
    }
  },
});

const router = Router();

router.post('/', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: '請提供音檔' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // 清理暫存檔
    fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'OPENAI_API_KEY 未設定' });
    return;
  }

  try {
    const openai = new OpenAI({ apiKey });
    const lang = (req.body.lang || '').slice(0, 5) || undefined; // th, vi, ja, ko, zh

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: 'whisper-1',
      language: lang,
    });

    res.json({ text: transcription.text });
  } catch (err: any) {
    console.error('[Whisper] Transcription error:', err?.message || err);
    res.status(500).json({ error: '語音辨識失敗' });
  } finally {
    // 清理暫存檔
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
  }
});

export default router;
