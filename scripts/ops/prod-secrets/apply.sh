#!/usr/bin/env bash
#
# Apply the 5 missing production secrets that cause STARTUP FATAL in the
# Railway backend (101 Sentry events / 24h via assertProductionStartupSecrets).
#
# This script reads values from /Users/danielpenin/.pi-ab.session-secrets.tmp
# (gitignored, mode 600, written once by the orchestrator) and pushes them
# to Railway via the `railway` CLI.
#
# Prerequisites:
#   1. railway login   (interactive OAuth; required because both Railway MCP
#      and the CLI session expired in the orchestrator's environment)
#   2. railway link    (cd into the backend service)
#   3. /Users/danielpenin/.pi-ab.session-secrets.tmp must exist
#
# After applying:
#   - service will redeploy automatically
#   - watch mcp__sentry-bridge__sentry_recent_issues for STARTUP FATAL → 0
#
# Rotation note: TIKTOK_CLIENT_SECRET and GOOGLE_ADS_DEVELOPER_TOKEN were
# shared in chat (logged); rotate them via TikTok dashboard + Google Ads
# dashboard immediately after this session.

set -euo pipefail

SECRETS_FILE="/Users/danielpenin/.pi-ab.session-secrets.tmp"
if [[ ! -f "${SECRETS_FILE}" ]]; then
  echo "FAIL: ${SECRETS_FILE} missing. Re-run orchestrator to regenerate." >&2
  exit 2
fi

if ! railway whoami >/dev/null 2>&1; then
  echo "FAIL: railway not authenticated. Run 'railway login' first." >&2
  exit 3
fi

# shellcheck disable=SC1090
source "${SECRETS_FILE}"

# User-provided (from chat — TIKTOK_CLIENT_KEY is the App ID; TIKTOK_CLIENT_SECRET
# is the App Secret; GOOGLE_ADS_DEVELOPER_TOKEN comes from Google Ads API console)
TIKTOK_CLIENT_KEY="7632164959169806353"
TIKTOK_CLIENT_SECRET_USER="7087e966d7616612886fe2cac219329f4a7c9712"
GOOGLE_ADS_DEVELOPER_TOKEN_USER="6YKEXBgdsP8ffJWdJyaPdw"
TIKTOK_REDIRECT_URI="https://app.kloel.com/integrations/tiktok/callback"

# Apply variables (railway variables set --service <name> KEY=VALUE)
# Adjust --service to match your service name (likely "backend" or "kloel-backend")
SERVICE="${1:-backend}"

echo "Applying secrets to Railway service '${SERVICE}'..."
railway variables set \
  TIKTOK_CLIENT_KEY="${TIKTOK_CLIENT_KEY}" \
  TIKTOK_CLIENT_SECRET="${TIKTOK_CLIENT_SECRET_USER}" \
  TIKTOK_REDIRECT_URI="${TIKTOK_REDIRECT_URI}" \
  TIKTOK_TOKEN_ENCRYPTION_KEY="${TIKTOK_TOKEN_ENCRYPTION_KEY}" \
  GOOGLE_ADS_DEVELOPER_TOKEN="${GOOGLE_ADS_DEVELOPER_TOKEN_USER}" \
  GOOGLE_ADS_TOKEN_ENCRYPTION_KEY="${GOOGLE_ADS_TOKEN_ENCRYPTION_KEY}" \
  EMAIL_INBOUND_SECRET="${EMAIL_INBOUND_SECRET}" \
  EMAIL_TOKEN_ENCRYPTION_KEY="${EMAIL_TOKEN_ENCRYPTION_KEY}" \
  --service "${SERVICE}"

echo ""
echo "Applied 8 variables. Railway will redeploy automatically."
echo ""
echo "Next steps:"
echo "  1. Wait ~3-5 min for redeploy"
echo "  2. Verify STARTUP FATAL stops:"
echo "     mcp__sentry-bridge__sentry_recent_issues since_minutes=30"
echo "  3. Rotate exposed values (TIKTOK_CLIENT_SECRET + GOOGLE_ADS_DEVELOPER_TOKEN)"
echo "     since they appeared in chat logs."
echo "  4. After confirmation, securely delete:"
echo "     shred -u ${SECRETS_FILE}"
