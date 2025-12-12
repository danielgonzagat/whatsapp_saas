#!/usr/bin/env bash
set -euo pipefail

# Script único para rodar E2E local sem flakiness:
# - Sobe Postgres/Redis (docker compose)
# - Roda migrations
# - Sobe backend + worker + frontend (locais)
# - Executa Playwright
# - Encerra processos locais ao final

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FRONTEND_URL="${E2E_FRONTEND_URL:-http://localhost:3000}"
API_URL="${E2E_API_URL:-http://localhost:3001}"

DATABASE_URL_DEFAULT="postgresql://postgres:password@localhost:5432/whatsapp_saas"
REDIS_URL_DEFAULT="redis://localhost:6379"

export NODE_ENV="${NODE_ENV:-development}"
export DATABASE_URL="${DATABASE_URL:-$DATABASE_URL_DEFAULT}"
export REDIS_URL="${REDIS_URL:-$REDIS_URL_DEFAULT}"
export JWT_SECRET="${JWT_SECRET:-dev-secret}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-e2e-dummy-key}"

# Evita que o Playwright "trave" servindo HTML report quando há falha.
export PW_TEST_HTML_REPORT_OPEN="${PW_TEST_HTML_REPORT_OPEN:-never}"

# Frontend NextAuth / API resolution (mantém compatibilidade dev/E2E)
export BACKEND_URL="${BACKEND_URL:-$API_URL}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-$API_URL}"

cleanup() {
  echo ""
  echo "== Cleanup =="

  for pid in "${FRONTEND_PID:-}" "${WORKER_PID:-}" "${BACKEND_PID:-}"; do
    if [[ -z "$pid" ]]; then
      continue
    fi
    kill "$pid" 2>/dev/null || true
  done

  # Best-effort: aguarda curtinho e força kill se necessário
  sleep 1
  for pid in "${FRONTEND_PID:-}" "${WORKER_PID:-}" "${BACKEND_PID:-}"; do
    if [[ -z "$pid" ]]; then
      continue
    fi
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd docker
require_cmd curl
require_cmd npm

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -i ":${port}" -P -n >/dev/null 2>&1
  else
    # Fallback (best effort)
    (echo >"/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1
  fi
}

free_port_if_requested() {
  local port="$1"

  if ! port_in_use "$port"; then
    return 0
  fi

  if [[ "${E2E_KILL_PORTS:-}" != "1" && "${E2E_KILL_PORTS:-}" != "true" ]]; then
    echo "Porta ${port} já está em uso. Encerre o processo antes de rodar este script." >&2
    echo "Dica: lsof -i :${port} -P -n" >&2
    echo "Ou rode com E2E_KILL_PORTS=true para o script tentar liberar a porta." >&2
    return 1
  fi

  if ! command -v lsof >/dev/null 2>&1; then
    echo "Não consigo liberar automaticamente a porta ${port} (lsof ausente)." >&2
    return 1
  fi

  local pids
  pids="$(lsof -ti ":${port}" || true)"
  if [[ -z "$pids" ]]; then
    return 0
  fi

  echo "Liberando porta ${port} (kill: ${pids})..."
  kill $pids 2>/dev/null || true
  sleep 1
  if port_in_use "$port"; then
    echo "Não foi possível liberar a porta ${port}." >&2
    return 1
  fi
  return 0
}

wait_http() {
  local url="$1"
  local name="$2"
  local max_secs="${3:-60}"

  echo "Aguardando ${name} em ${url}..."
  local start="$(date +%s)"
  while true; do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo "✓ ${name} OK"
      return 0
    fi
    local now="$(date +%s)"
    if (( now - start >= max_secs )); then
      echo "Timeout aguardando ${name} (${max_secs}s): ${url}" >&2
      return 1
    fi
    sleep 1
  done
}

echo "== Subindo infra (postgres/redis) =="
docker compose -f "${ROOT}/docker-compose.yml" up -d postgres redis

echo "== Rodando migrations (backend) =="
(
  cd "${ROOT}/backend"
  npx prisma migrate deploy
)

# Evita rodar em cima de serviços já ocupando portas (ou libera se E2E_KILL_PORTS=true)
for port in 3000 3001 3003; do
  free_port_if_requested "$port" || exit 1
done

echo "== Subindo backend (dev) =="
(
  cd "${ROOT}/backend"
  npm run start:dev
) >/tmp/kloel-backend.log 2>&1 &
BACKEND_PID=$!

echo "== Subindo worker =="
(
  cd "${ROOT}/worker"
  npm run start
) >/tmp/kloel-worker.log 2>&1 &
WORKER_PID=$!

echo "== Subindo frontend (dev) =="
(
  cd "${ROOT}/frontend"
  npm run dev
) >/tmp/kloel-frontend.log 2>&1 &
FRONTEND_PID=$!

# Health checks
wait_http "${API_URL}/health" "Backend" 90 || {
  echo "--- tail backend log ---" >&2
  tail -n 200 /tmp/kloel-backend.log >&2 || true
  exit 1
}

wait_http "http://localhost:3003/health" "Worker" 90 || {
  echo "--- tail worker log ---" >&2
  tail -n 200 /tmp/kloel-worker.log >&2 || true
  exit 1
}

wait_http "${FRONTEND_URL}/login" "Frontend" 90 || {
  echo "--- tail frontend log ---" >&2
  tail -n 200 /tmp/kloel-frontend.log >&2 || true
  exit 1
}

echo "== Rodando Playwright E2E =="
(
  cd "${ROOT}/e2e"
  npm test
)

echo "✓ E2E concluído com sucesso"
