FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx vite build

# 重新安裝只保留 production deps + tsx
RUN rm -rf node_modules && npm ci --omit=dev && npm install tsx

# --- Production ---
FROM node:22-slim

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist/client ./dist/client
COPY --from=builder /app/package.json ./
COPY server ./server
COPY shared ./shared

RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3000/api/health || exit 1

CMD ["npx", "tsx", "server/index.ts"]
