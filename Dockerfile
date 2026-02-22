FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx vite build

# --- Production ---
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm install tsx

COPY --from=builder /app/dist/client ./dist/client
COPY server ./server
COPY shared ./shared
COPY .env.example .env.example

# 資料目錄（掛載持久化磁碟）
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npx", "tsx", "server/index.ts"]
