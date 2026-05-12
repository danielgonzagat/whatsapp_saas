FROM node:22-bookworm AS backend-build

WORKDIR /app/backend

ENV PRISMA_CLI_BINARY_TARGETS="debian-openssl-3.0.x"

COPY backend/package.json backend/package-lock.json ./
COPY backend/vendor ./vendor
RUN npm ci --include=dev --no-audit --fund=false

COPY backend ./
RUN npm run prisma:generate
RUN npm run build
RUN npm prune --omit=dev --no-audit --fund=false

FROM node:22-bookworm AS backend-runtime

WORKDIR /app/backend

ENV NODE_ENV=production
ENV PRISMA_CLI_BINARY_TARGETS="debian-openssl-3.0.x"

COPY --from=backend-build --chown=node:node /app/backend ./

RUN mkdir -p /app/backend/public/audio /app/backend/uploads && \
    chown -R node:node /app/backend

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/health/live').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

USER node

CMD ["sh", "-c", "node prisma/ensure-migrations.js && node -r ./dd-trace-init.cjs dist/src/bootstrap.js"]
