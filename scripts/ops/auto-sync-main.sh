#!/bin/zsh
# shellcheck shell=bash
set -euo pipefail

REPO_DIR="${1:-$HOME/whatsapp_saas}"
REMOTE_NAME="${KLOEL_SYNC_REMOTE:-origin}"
BRANCH_NAME="${KLOEL_SYNC_BRANCH:-main}"
MIRROR_DIR="${KLOEL_SYNC_MIRROR_DIR:-$HOME/whatsapp_saas_live}"
STATUS_DIR="${KLOEL_SYNC_STATUS_DIR:-$HOME/Library/Application Support/Kloel}"
STATUS_FILE="${KLOEL_SYNC_STATUS_FILE:-$STATUS_DIR/auto-sync-status.txt}"
LOG_PREFIX="[kloel-auto-sync]"
CURRENT_BRANCH=""
LOCAL_SHA=""
REMOTE_SHA=""
BASE_SHA=""
MIRROR_SHA=""

mkdir -p "$STATUS_DIR"

write_status() {
  local state="$1"
  local message="$2"
  local now

  now="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  {
    print -r -- "status=$state"
    print -r -- "updated_at=$now"
    print -r -- "message=$message"
    print -r -- "repo_dir=$REPO_DIR"
    print -r -- "branch_name=$BRANCH_NAME"
    print -r -- "current_branch=${CURRENT_BRANCH:-unknown}"
    print -r -- "remote_name=$REMOTE_NAME"
    print -r -- "mirror_dir=$MIRROR_DIR"
    print -r -- "local_sha=${LOCAL_SHA:-}"
    print -r -- "remote_sha=${REMOTE_SHA:-}"
    print -r -- "base_sha=${BASE_SHA:-}"
    print -r -- "mirror_sha=${MIRROR_SHA:-}"
  } > "$STATUS_FILE"
}

on_error() {
  write_status "error" "falha durante execucao do auto-sync"
}

trap on_error ERR

if [[ ! -d "$REPO_DIR/.git" ]]; then
  write_status "error" "repo inexistente"
  echo "$LOG_PREFIX repo inexistente: $REPO_DIR"
  exit 1
fi

sync_mirror_clone() {
  local repo_url

  repo_url="$(git -C "$REPO_DIR" remote get-url "$REMOTE_NAME")"
  if [[ -z "$repo_url" ]]; then
    write_status "warning" "remoto nao encontrado; espelho ignorado"
    echo "$LOG_PREFIX remoto '$REMOTE_NAME' nao encontrado, espelho ignorado"
    return 0
  fi

  if [[ ! -d "$MIRROR_DIR/.git" ]]; then
    rm -rf "$MIRROR_DIR"
    git clone --branch "$BRANCH_NAME" --single-branch "$repo_url" "$MIRROR_DIR" >/dev/null 2>&1
    echo "$LOG_PREFIX espelho criado em $MIRROR_DIR"
  fi

  git -C "$MIRROR_DIR" fetch --prune "$REMOTE_NAME" "$BRANCH_NAME" >/dev/null 2>&1
  git -C "$MIRROR_DIR" checkout "$BRANCH_NAME" >/dev/null 2>&1
  git -C "$MIRROR_DIR" reset --hard "$REMOTE_NAME/$BRANCH_NAME" >/dev/null 2>&1
  MIRROR_SHA="$(git -C "$MIRROR_DIR" rev-parse HEAD)"
  echo "$LOG_PREFIX espelho atualizado em $MIRROR_DIR"
}

cd "$REPO_DIR"

LOCK_DIR=".git/kloel-auto-sync.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  write_status "running" "sync ja em execucao"
  echo "$LOG_PREFIX sync ja em execucao"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

LOCAL_SHA="$(git rev-parse HEAD 2>/dev/null || true)"

if [[ -d .git/rebase-apply || -d .git/rebase-merge || -f .git/MERGE_HEAD || -f .git/CHERRY_PICK_HEAD || -f .git/BISECT_LOG ]]; then
  write_status "blocked" "operacao git em andamento"
  echo "$LOG_PREFIX operacao git em andamento, pulando"
  exit 0
fi

CURRENT_BRANCH="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
if [[ "$CURRENT_BRANCH" != "$BRANCH_NAME" ]]; then
  echo "$LOG_PREFIX branch atual '$CURRENT_BRANCH' != '$BRANCH_NAME', pulando"
  sync_mirror_clone
  write_status "blocked" "branch atual diferente da branch de sync"
  exit 0
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "$LOG_PREFIX worktree sujo, pulando para nao sobrescrever alteracoes locais"
  sync_mirror_clone
  write_status "blocked" "worktree sujo; principal preservado e espelho atualizado"
  exit 0
fi

git fetch --prune "$REMOTE_NAME" "$BRANCH_NAME" >/dev/null 2>&1

LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "$REMOTE_NAME/$BRANCH_NAME")"
BASE_SHA="$(git merge-base HEAD "$REMOTE_NAME/$BRANCH_NAME")"

if [[ "$LOCAL_SHA" == "$REMOTE_SHA" ]]; then
  echo "$LOG_PREFIX repo ja atualizado"
  sync_mirror_clone
  write_status "ok" "repo principal e espelho ja atualizados"
  exit 0
fi

if [[ "$LOCAL_SHA" != "$BASE_SHA" ]]; then
  echo "$LOG_PREFIX branch divergente do remoto, pulando para evitar merge automatico"
  sync_mirror_clone
  write_status "blocked" "branch divergente; principal preservado e espelho atualizado"
  exit 0
fi

git pull --ff-only "$REMOTE_NAME" "$BRANCH_NAME" >/dev/null 2>&1
NEW_SHA="$(git rev-parse HEAD)"
echo "$LOG_PREFIX atualizado $LOCAL_SHA -> $NEW_SHA"
LOCAL_SHA="$NEW_SHA"
sync_mirror_clone
write_status "ok" "repo principal atualizado em fast-forward e espelho sincronizado"
