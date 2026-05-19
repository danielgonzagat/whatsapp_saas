#!/usr/bin/env zsh
cd /Users/danielpenin/whatsapp_saas || exit 1
MAX_RSS_KB=${KLOEL_MIRROR_MAX_RSS_KB:-131072}
while true; do
  NODE_OPTIONS="--max-old-space-size=64" \
  KLOEL_MIRROR_GIT_STATE_POLL_MS=15000 \
  KLOEL_MIRROR_GRAPH_LENS_ENFORCE_MS=60000 \
  node scripts/obsidian-mirror-daemon.mjs --watch >> tmp/obsidian-mirror-daemon.log 2>&1 &
  pid=$!
  printf '%s\n' "$pid" > tmp/obsidian-mirror-daemon.pid
  while kill -0 "$pid" 2>/dev/null; do
    rss=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ')
    if [[ -n "$rss" && "$rss" -gt "$MAX_RSS_KB" ]]; then
      printf '[%s] RSS %sKB exceeded %sKB; restarting mirror daemon\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$rss" "$MAX_RSS_KB" >> tmp/obsidian-mirror-daemon.log
      kill -TERM "$pid" 2>/dev/null || true
      sleep 2
      kill -KILL "$pid" 2>/dev/null || true
      break
    fi
    sleep 30
  done
  wait "$pid" 2>/dev/null || true
  sleep 2
done
