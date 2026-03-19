# Backend Dockerfile
FROM node:20-bookworm

WORKDIR /app

# Prisma binaries para Debian + OpenSSL 3
ENV PRISMA_CLI_BINARY_TARGETS="debian-openssl-3.0.x"

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate

RUN npm run build
RUN npm prune --omit=dev

# Railway injeta PORT automaticamente; app usa PORT || 3001
EXPOSE 3001

# Healthcheck para monitoramento
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3001}/health || exit 1

# Executa migrations e inicia a aplicação
# As migrations são aplicadas a cada deploy para garantir que o banco está atualizado
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
