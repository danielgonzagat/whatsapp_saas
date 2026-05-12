# Worker Dockerfile.
# Chromium/Xvfb remain only for generic scraping jobs; WhatsApp runtime is Meta-only.
# Redis runtime policy: worker resolves only REDIS_URL/internal component vars.

# ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:20-bookworm@sha256:8f693eaa7e0a8e71560c9a82b55fd54c2ae920a2ba5d2cde28bac7d1c01c9ba5 AS builder

ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --fund=false

COPY . .
RUN npx prisma generate --schema=prisma/schema.prisma --no-hints && npm run build

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-bookworm@sha256:8f693eaa7e0a8e71560c9a82b55fd54c2ae920a2ba5d2cde28bac7d1c01c9ba5 AS runtime

ENV DEBIAN_FRONTEND=noninteractive \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      chromium \
      xvfb \
      xauth \
      ca-certificates \
      fonts-freefont-ttf \
      curl \
      dumb-init && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x \
    DISPLAY=:99

WORKDIR /app

# Copy only production artifacts from builder, already owned by the runtime user.
COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Create runtime directories before switching user.
RUN mkdir -p /app/backend/public/audio /app/public /tmp/.X11-unix && \
    chown node:node /app/backend/public/audio /app/public /tmp/.X11-unix

# Railway exposes a single port via PORT env var
EXPOSE 8080

# Healthcheck against the unified server (uses PORT from Railway)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

USER node

# xvfb-run is retained for scraper workloads that still launch Chromium.
CMD ["sh", "-c", "xvfb-run --server-args='-screen 0 1440x900x24 -ac' node dist/bootstrap.js"]
