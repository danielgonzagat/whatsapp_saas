#!/usr/bin/env bash
# bootstrap.sh — Instala o HUD KLOEL (vault Obsidian + daemons) NA MÁQUINA DO AMIGO.
#
# Pré-requisito: este repositório já clonado (os scripts do HUD vêm com ele).
#
# Uso:
#   tools/hud-portable/bootstrap.sh [CAMINHO_DO_VAULT]
#
# Sem argumento, usa "$HOME/Documents/Obsidian Vault".
# Re-executar é seguro: passe --force para sobrescrever um vault já existente.
set -euo pipefail

FORCE=0
VAULT_ARG=""
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    *) VAULT_ARG="$a" ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARBALL="$SCRIPT_DIR/kloel-obsidian-hud-skeleton.tar.gz"
VAULT_ROOT="${VAULT_ARG:-$HOME/Documents/Obsidian Vault}"
MIRROR_ROOT="$VAULT_ROOT/Kloel/99 - Espelho do Codigo"

echo "── KLOEL HUD bootstrap ───────────────────────────────"
echo "  repo  : $REPO_ROOT"
echo "  vault : $VAULT_ROOT"
echo "──────────────────────────────────────────────────────"

command -v node >/dev/null 2>&1 || { echo "ERRO: node não encontrado no PATH."; exit 1; }
command -v tar  >/dev/null 2>&1 || { echo "ERRO: tar não encontrado no PATH.";  exit 1; }
command -v perl >/dev/null 2>&1 || { echo "ERRO: perl não encontrado no PATH."; exit 1; }
[ -f "$TARBALL" ] || { echo "ERRO: bundle ausente: $TARBALL (faça git pull)"; exit 1; }

if [ -e "$VAULT_ROOT/.obsidian" ] && [ "$FORCE" -ne 1 ]; then
  echo "ERRO: já existe um vault em '$VAULT_ROOT'."
  echo "      Re-rode com --force para sobrescrever a config do HUD, ou"
  echo "      escolha outro caminho: tools/hud-portable/bootstrap.sh /outro/caminho"
  exit 1
fi

mkdir -p "$VAULT_ROOT"
echo "[1/4] extraindo esqueleto do vault…"
tar -xzf "$TARBALL" --strip-components=1 -C "$VAULT_ROOT"

echo "[2/4] substituindo placeholders pelos caminhos desta máquina…"
export R="$REPO_ROOT" V="$VAULT_ROOT" H="$HOME"
find "$VAULT_ROOT" -type f \
  \( -name '*.js' -o -name '*.ts' -o -name '*.mjs' -o -name '*.cjs' \
     -o -name '*.json' -o -name '*.md' -o -name '*.css' -o -name '*.txt' \
     -o -name '*.base' -o -name '*.canvas' \) \
  -exec perl -pi -e \
    's/\Q__KLOEL_REPO_ROOT__\E/$ENV{R}/g; s/\Q__KLOEL_VAULT_ROOT__\E/$ENV{V}/g; s/\Q__KLOEL_HOME__\E/$ENV{H}/g' \
    {} +

echo "[3/4] gravando env do HUD…"
ENV_FILE="$SCRIPT_DIR/.hud-env"
cat > "$ENV_FILE" <<EOF
# Gerado por bootstrap.sh — carregue antes de rodar qualquer script do HUD:
#   source tools/hud-portable/.hud-env
export KLOEL_REPO_ROOT="$REPO_ROOT"
export KLOEL_VAULT_ROOT="$VAULT_ROOT"
export KLOEL_MIRROR_ROOT="$MIRROR_ROOT"
EOF
echo "      → $ENV_FILE"

echo "[4/4] checando dependências do repo…"
if [ ! -d "$REPO_ROOT/node_modules" ]; then
  echo "      node_modules ausente — rode 'npm ci' na raiz do repo antes dos daemons."
fi

cat <<EOF

✅ Esqueleto instalado em: $VAULT_ROOT

Próximos passos (uma vez):

  1. Dependências do repo (se ainda não fez):
       cd "$REPO_ROOT" && npm ci

  2. Carregue o env do HUD (toda sessão de terminal):
       source tools/hud-portable/.hud-env

  3. Abra o Obsidian nesse vault:
       open -a Obsidian "$VAULT_ROOT"     # macOS
     Em Configurações → Plugins da Comunidade, ative-os se pedir confiança.
     O plugin "Local REST API" gera uma CHAVE NOVA (a antiga não viaja por
     segurança). Copie-a para a config MCP do Claude/OpenCode — veja
     docs/HUD_README.md seção 6.

  4. Suba os daemons (deixe rodando):
       node scripts/obsidian-mirror-daemon.mjs &
       npm run findings:watch &
       node scripts/orchestration/graph-color-watchdog.mjs --start &
       node scripts/orchestration/hud-orchestrator.mjs --watch &

  5. Primeiro refresh + verificação:
       node scripts/orchestration/hud-orchestrator.mjs --once
       node scripts/orchestration/hud-audit.mjs --once

O mirror daemon vai reconstruir "99 - Espelho do Codigo/_source" a partir
do código deste repo na sua máquina (não vem no bundle por ser pesado e
regenerável). Detalhes operacionais: docs/HUD_README.md
EOF
