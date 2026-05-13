# Compatibility Dockerfile for the persisted Railway Worker service config.
# The service still points at /worker/railway.toml and worker/Dockerfile while
# GitHub Actions uploads worker/ as the deployment root.

FROM node:20-bookworm@sha256:8f693eaa7e0a8e71560c9a82b55fd54c2ae920a2ba5d2cde28bac7d1c01c9ba5 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run prisma:generate && npm run build

FROM node:20-bookworm@sha256:8f693eaa7e0a8e71560c9a82b55fd54c2ae920a2ba5d2cde28bac7d1c01c9ba5 AS runtime

ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

RUN mkdir -p /app/backend/public/audio /app/public && chown -R node:node /app

EXPOSE 8080

USER node

CMD ["npm", "run", "start:prod"]
