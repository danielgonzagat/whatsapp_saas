# Worker Dockerfile (Debian-based to match Prisma binaries and Chrome deps)
FROM node:20-bookworm

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

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate

RUN npm run build

# Railway exposes a single port via PORT env var
EXPOSE 8080

# Healthcheck against the unified server (uses PORT from Railway)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# xvfb-run creates a virtual X display so Puppeteer can run headful Chrome
CMD ["sh", "-c", "xvfb-run --server-args='-screen 0 1440x900x24 -ac' npm run start:prod"]
