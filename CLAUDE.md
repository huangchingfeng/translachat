# TranslaChat
即時翻譯聊天應用，前後端分離架構。

## 技術棧
- Frontend: Vite + React
- Backend: Express + tsx
- DB: Drizzle ORM
- 部署: Fly.io (Docker)

## 開發指令
```bash
npm run dev         # 同時啟動前後端
npm run dev:server  # 只啟動後端
npm run dev:client  # 只啟動前端
npm run build       # 建置
npm run start       # 啟動 production
npm run db:push     # 推送 DB schema
```

## 部署
- Platform: Fly.io
- 設定: `fly.toml` + `Dockerfile`
