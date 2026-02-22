# TranslaChat 即時翻譯聊天

> 跨語言即時通訊工具 — 讓不同語言的人輕鬆對話

Host（主持人）建立聊天房間，分享連結給 Guest（訪客），雙方各用自己的語言聊天，系統自動即時翻譯。

## 功能特色

- **即時翻譯** — 支援泰文、越南文、日文、韓文、繁體中文五種語言
- **語音輸入** — 使用瀏覽器原生語音辨識（Web Speech API）
- **自動語言介面** — 訪客選擇語言後，整個 UI 自動切換為該語言
- **房間管理** — Host 可建立、編輯、刪除多個聊天房間
- **即時通訊** — 基於 Socket.io 的低延遲雙向通訊
- **翻譯快取** — LRU Cache 避免重複翻譯，節省 API 額度
- **打字指示** — 對方正在輸入時即時顯示
- **上下線通知** — Guest 連線 / 離線狀態即時通知
- **訊息速率限制** — 每秒最多 5 則訊息，防止濫用
- **訊息長度限制** — 單則訊息最多 2000 字元

## 技術棧

| 層級 | 技術 |
|------|------|
| **前端** | React 19 + Vite 6 + TailwindCSS 3 |
| **後端** | Express 4 + Socket.io 4 + TypeScript 5 |
| **資料庫** | SQLite (better-sqlite3) + Drizzle ORM |
| **翻譯** | Google Gemini API (`gemini-2.0-flash`) |
| **驗證** | JWT (jsonwebtoken) + bcryptjs |
| **部署** | Render.com / Fly.io / Docker |

## 快速開始

### 環境需求

- Node.js 18+
- npm 9+
- Google Gemini API Key（[取得方式](https://aistudio.google.com/apikey)）

### 安裝

```bash
git clone https://github.com/your-username/translachat.git
cd translachat
npm install
```

### 設定環境變數

```bash
cp .env.example .env
```

編輯 `.env`，填入必要設定：

```env
# Gemini API Key（必填，用於翻譯）
GEMINI_API_KEY=your-gemini-api-key

# JWT Secret（必填，用於驗證）
JWT_SECRET=your-jwt-secret-change-this

# 預設 Host 帳號
HOST_EMAIL=admin@translachat.com
HOST_PASSWORD=changeme
HOST_NAME=Host

# 資料目錄（選填，預設 ./data）
DATA_DIR=./data

# CORS 允許來源（選填，逗號分隔）
ALLOWED_ORIGINS=http://localhost:5173

# 連接埠（選填，預設 3000）
PORT=3000
```

### 啟動開發伺服器

```bash
npm run dev
```

前端：http://localhost:5173
後端：http://localhost:3000

首次啟動會自動建立 SQLite 資料庫並新增預設 Host 帳號。

## 使用方式

### Host（主持人）

1. 前往 `/login`，使用 `.env` 中設定的帳密登入
2. 進入 Dashboard，點擊「建立房間」
3. 複製房間連結，分享給訪客

### Guest（訪客）

1. 開啟 Host 分享的連結（`/chat/:slug`）
2. 選擇自己的語言
3. 輸入暱稱，開始聊天

雙方各用自己的語言輸入，系統自動翻譯給對方。

## 專案結構

```
translachat/
├── client/                  # 前端（React + Vite）
│   ├── src/
│   │   ├── pages/           # 頁面元件
│   │   │   ├── Login.tsx    # Host 登入
│   │   │   ├── Dashboard.tsx# Host 管理後台
│   │   │   ├── HostChat.tsx # Host 聊天介面
│   │   │   └── GuestChat.tsx# Guest 聊天介面
│   │   ├── lib/
│   │   │   ├── api.ts       # HTTP API 封裝
│   │   │   └── socket.ts    # Socket.io 連線封裝
│   │   ├── App.tsx          # 路由設定
│   │   └── main.tsx         # 進入點
│   └── index.html
├── server/                  # 後端（Express + Socket.io）
│   ├── routes/
│   │   ├── auth.ts          # 登入 / 登出
│   │   ├── rooms.ts         # 房間 CRUD（需驗證）
│   │   └── chat.ts          # 聊天室公開 API（訪客用）
│   ├── middleware/
│   │   └── auth.ts          # JWT 驗證中介層
│   ├── services/
│   │   └── translator.ts    # Gemini 翻譯服務 + 快取 + 重試
│   ├── db/
│   │   ├── schema.ts        # Drizzle ORM Schema
│   │   └── index.ts         # DB 初始化 + Seed
│   ├── socket.ts            # Socket.io 事件處理
│   └── index.ts             # Server 進入點
├── shared/
│   └── types.ts             # 前後端共用型別 + 語言設定
├── data/                    # SQLite 資料庫（gitignore）
├── Dockerfile               # Docker 多階段建構
├── render.yaml              # Render.com 部署設定
├── fly.toml                 # Fly.io 部署設定
└── .env.example             # 環境變數範本
```

## API 端點

### 認證

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/auth/login` | Host 登入，回傳 JWT | - |
| POST | `/api/auth/logout` | Host 登出 | - |

### 房間管理（需 JWT）

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/rooms` | 列出所有房間（含最後訊息） | Bearer |
| POST | `/api/rooms` | 建立新房間 | Bearer |
| PATCH | `/api/rooms/:id` | 更新房間（名稱、狀態） | Bearer |
| DELETE | `/api/rooms/:id` | 刪除房間及所有訊息 | Bearer |
| GET | `/api/rooms/:id/messages` | 取得房間訊息（分頁） | Bearer |

### 聊天室（訪客公開）

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/chat/:slug` | 取得聊天室資訊 | - |
| PATCH | `/api/chat/:slug/guest` | 更新訪客名稱 / 語言 | - |
| GET | `/api/chat/:slug/messages` | 取得聊天訊息（分頁） | - |

### 系統

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/health` | 健康檢查 | - |

## WebSocket 事件

### Client -> Server

| Event | Data | Description |
|-------|------|-------------|
| `room:join` | `{ slug }` | 加入聊天房間 |
| `message:send` | `{ text, sourceLang }` | 發送訊息 |
| `language:change` | `{ lang }` | 切換語言 |
| `typing:start` | - | 開始打字 |
| `typing:stop` | - | 停止打字 |
| `guest:setName` | `{ name }` | 設定訪客暱稱 |

### Server -> Client

| Event | Data | Description |
|-------|------|-------------|
| `room:joined` | `{ roomId, hostLang, guestLang }` | 加入成功 |
| `message:new` | `Message` | 新訊息（含原文 + 翻譯） |
| `message:error` | `{ error }` | 錯誤訊息 |
| `typing:indicator` | `{ sender, isTyping }` | 打字指示 |
| `guest:online` | `{ isOnline }` | 訪客上下線 |
| `language:changed` | `{ lang, role }` | 語言已變更 |

## 支援語言

| 代碼 | 語言 | 原生名稱 |
|------|------|---------|
| `th` | 泰文 | ภาษาไทย |
| `vi` | 越南文 | Tiếng Việt |
| `ja` | 日文 | 日本語 |
| `ko` | 韓文 | 한국어 |
| `zh-TW` | 繁體中文 | 繁體中文 |

## 部署

### Render.com

專案已包含 `render.yaml`，可直接使用 Render Blueprint 部署：

1. 連結 GitHub 倉庫
2. 選擇 Blueprint 部署
3. 在 Render Dashboard 設定環境變數（`GEMINI_API_KEY`、`JWT_SECRET` 等）

### Fly.io

```bash
fly launch
fly secrets set GEMINI_API_KEY=your-key JWT_SECRET=your-secret HOST_EMAIL=admin@translachat.com HOST_PASSWORD=your-password
fly deploy
```

### Docker

```bash
docker build -t translachat .
docker run -p 3000:3000 \
  -e GEMINI_API_KEY=your-key \
  -e JWT_SECRET=your-secret \
  -e HOST_EMAIL=admin@translachat.com \
  -e HOST_PASSWORD=your-password \
  -v translachat-data:/data \
  translachat
```

SQLite 資料庫存放於 `/data`，請掛載 volume 以持久化資料。

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | 同時啟動前後端開發伺服器 |
| `npm run dev:server` | 僅啟動後端（tsx watch） |
| `npm run dev:client` | 僅啟動前端（Vite） |
| `npm run build` | 建構前端 + 編譯後端 |
| `npm start` | 啟動 production 伺服器 |
| `npm run db:push` | 同步 Drizzle Schema 到資料庫 |

## 授權

MIT
