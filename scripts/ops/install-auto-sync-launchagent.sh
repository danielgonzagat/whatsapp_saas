#!/bin/zsh
# shellcheck shell=bash
set -euo pipefail

REPO_DIR="${1:-$HOME/whatsapp_saas}"
AGENT_ID="com.kloel.git-autosync"
PLIST_PATH="$HOME/Library/LaunchAgents/$AGENT_ID.plist"
LOG_DIR="$HOME/Library/Logs"
STDOUT_LOG="$LOG_DIR/$AGENT_ID.log"
STDERR_LOG="$LOG_DIR/$AGENT_ID.error.log"
SCRIPT_PATH="$REPO_DIR/scripts/ops/auto-sync-main.sh"
STATUS_SCRIPT_PATH="$REPO_DIR/scripts/ops/print-auto-sync-status.sh"
UID_VALUE="$(id -u)"

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>$AGENT_ID</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/zsh</string>
      <string>$SCRIPT_PATH</string>
      <string>$REPO_DIR</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>StartInterval</key>
    <integer>60</integer>
    <key>WorkingDirectory</key>
    <string>$REPO_DIR</string>
    <key>StandardOutPath</key>
    <string>$STDOUT_LOG</string>
    <key>StandardErrorPath</key>
    <string>$STDERR_LOG</string>
  </dict>
</plist>
PLIST

chmod +x "$SCRIPT_PATH" "$STATUS_SCRIPT_PATH"

launchctl bootout "gui/$UID_VALUE" "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$UID_VALUE" "$PLIST_PATH"
launchctl enable "gui/$UID_VALUE/$AGENT_ID"
launchctl kickstart -k "gui/$UID_VALUE/$AGENT_ID"

echo "LaunchAgent instalado em $PLIST_PATH"
echo "Logs: $STDOUT_LOG / $STDERR_LOG"
echo "Status: $HOME/Library/Application Support/Kloel/auto-sync-status.txt"
