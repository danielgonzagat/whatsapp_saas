# Frontend (Next.js) Dockerfile
# Multi-stage build para produção

FROM node:20-bookworm AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-bookworm AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm AS runner
WORKDIR /app
ENV NODE_ENV=production

# Instala apenas deps de produção
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Artefatos de build
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

# Next respeita -p; PORT pode vir do provedor
CMD ["sh", "-c", "npm run start -- -p ${PORT:-3000}"]
