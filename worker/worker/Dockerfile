# Compatibility Dockerfile for the persisted Railway Worker service config.
# GitHub Actions uploads worker/ as the deployment root, while Railway still
# references worker/Dockerfile in the service metadata.

FROM node:20-bookworm AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run prisma:generate && npm run build

FROM node:20-bookworm AS runtime

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
