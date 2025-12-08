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

# Railway injeta PORT automaticamente (geralmente 3000)
# EXPOSE é apenas documentação - a porta real vem de $PORT
EXPOSE 3000

# Executa migrations e inicia a aplicação
# As migrations são aplicadas a cada deploy para garantir que o banco está atualizado
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
