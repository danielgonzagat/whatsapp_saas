# Frontend (Next.js) Dockerfile
# Multi-stage build para produção

FROM node:20-bookworm AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-bookworm AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_SCREENCAST_WS_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID}
ENV NEXT_PUBLIC_SCREENCAST_WS_URL=${NEXT_PUBLIC_SCREENCAST_WS_URL}
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

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/ || exit 1

USER node

# Next respeita -p; PORT pode vir do provedor
CMD ["sh", "-c", "npm run start -- -p ${PORT:-3000}"]
