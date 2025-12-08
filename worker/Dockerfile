# Worker Dockerfile (Debian-based to match Prisma binaries and Chrome deps)
FROM node:20-bookworm

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-freefont-ttf \
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

# Ensure database migrations are applied before starting the worker.
# This guarantees all tables exist even if worker starts before backend.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
