# Worker Dockerfile.
# Chromium/Xvfb remain only for generic scraping jobs; WhatsApp runtime is Meta-only.
# Redis runtime policy: worker resolves only REDIS_URL/internal component vars.

# ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:20-bookworm AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run prisma:generate && npm run build

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-bookworm AS runtime

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

# Copy only production artifacts from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Create runtime directories and fix permissions before switching user
RUN mkdir -p /app/backend/public/audio /app/public /tmp/.X11-unix && \
    chown -R node:node /app /tmp/.X11-unix

# Railway exposes a single port via PORT env var
EXPOSE 8080

# Healthcheck against the unified server (uses PORT from Railway)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

USER node

# xvfb-run is retained for scraper workloads that still launch Chromium.
CMD ["sh", "-c", "xvfb-run --server-args='-screen 0 1440x900x24 -ac' npm run start:prod"]
