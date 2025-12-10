# Worker Dockerfile (Debian-based to match Prisma binaries and Chrome deps)
FROM node:20-bookworm

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-freefont-ttf \
      curl \
      dumb-init && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate

RUN npm run build

# Worker metrics server defaults to port 3003
EXPOSE 3003

# Healthcheck against metrics server
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${WORKER_METRICS_PORT:-3003}/health || exit 1

# Ensure database migrations are applied before starting the worker.
# This guarantees all tables exist even if worker starts before backend.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
