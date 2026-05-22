#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT/e2e/docker-compose.test.yml"

echo "[e2e:setup] Starting ephemeral containers..."
docker compose -f "$COMPOSE_FILE" up -d --wait

echo "[e2e:setup] Applying migrations to ephemeral Postgres..."
DATABASE_URL="postgresql://postgres:password@localhost:5433/whatsapp_saas_e2e" \
  npx prisma migrate deploy --schema="$ROOT/backend/prisma/schema.prisma"

echo "[e2e:setup] Generating Prisma client..."
DATABASE_URL="postgresql://postgres:password@localhost:5433/whatsapp_saas_e2e" \
  npx prisma generate --schema="$ROOT/backend/prisma/schema.prisma" --no-hints

echo "[e2e:setup] Seeding minimal data..."
DATABASE_URL="postgresql://postgres:password@localhost:5433/whatsapp_saas_e2e" \
  npx tsx "$ROOT/backend/prisma/seed.ts"

echo "[e2e:setup] Done. Containers running:"
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "Export these env vars for e2e tests:"
echo "  export E2E_API_URL=http://localhost:3001"
echo "  export E2E_WORKER_URL=http://localhost:3003"
echo "  export DATABASE_URL=postgresql://postgres:password@localhost:5433/whatsapp_saas_e2e"
echo "  export REDIS_URL=redis://localhost:6380"
