import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authMiddleware } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');
const uploadDir = path.join(dataDir, 'uploads');

// 確保上傳目錄存在
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = /^(image\/(jpeg|png|gif|webp)|audio\/(webm|mp4|ogg|wav|mpeg))$/;
    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支援的檔案類型'));
    }
  },
});

const router = Router();

// 上傳檔案（需驗證身份或 guest 也能上傳）
router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: '請選擇檔案' });
    return;
  }

  const fileUrl = `/uploads/${req.file.filename}`;
  const fileType = req.file.mimetype.startsWith('image/') ? 'image' : 'audio';

  res.json({ url: fileUrl, type: fileType, filename: req.file.filename });
});

export default router;
