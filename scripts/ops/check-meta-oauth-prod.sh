#!/usr/bin/env bash
# Smoke test for the Meta OAuth integration in production.
#
# Usage:
#   KLOEL_API=https://api.kloel.com \
#   KLOEL_JWT="ey..." \
#   KLOEL_WORKSPACE_ID="ws_..." \
#   bash scripts/ops/check-meta-oauth-prod.sh
#
# Validates:
#   - GET /meta/auth/diagnostics returns 200
#   - isFallback === false
#   - appCredentialsPresent === true
#   - backendUrlRegistered === true
#   - redirectUri matches what you have in the Meta App console
#
# Does NOT touch secrets. Reads env vars only.
set -u
set -o pipefail

API="${KLOEL_API:-https://api.kloel.com}"
JWT="${KLOEL_JWT:?KLOEL_JWT env var is required}"
WID="${KLOEL_WORKSPACE_ID:?KLOEL_WORKSPACE_ID env var is required}"

echo "[meta-oauth-smoke] target=${API}/meta/auth/diagnostics workspace=${WID}"

resp=$(curl -fsS \
  -H "Authorization: Bearer ${JWT}" \
  -H "x-workspace-id: ${WID}" \
  "${API}/meta/auth/diagnostics") || {
  echo "[meta-oauth-smoke] FAIL — request failed (auth, CORS or 5xx)."
  exit 1
}

echo "[meta-oauth-smoke] response:"
echo "$resp" | jq

fail=0
check() {
  local jq_expr="$1"
  local desc="$2"
  if echo "$resp" | jq -e "${jq_expr}" >/dev/null; then
    echo "  ✅ ${desc}"
  else
    echo "  ❌ ${desc}"
    fail=1
  fi
}

check '.isFallback == false'                  'redirect URI is NOT the localhost fallback'
check '.checklist.appCredentialsPresent'      'META_APP_ID + META_APP_SECRET both set'
check '.checklist.backendUrlRegistered'       'backend URL registered'
check '.appIdSet'                             'META_APP_ID set'
check '.appSecretSet'                         'META_APP_SECRET set'
check '.verifyTokenSet'                       'META_VERIFY_TOKEN set (for webhook)'
check '.redirectUri | startswith("https://")' 'redirect URI is https'

if [[ $fail -eq 0 ]]; then
  echo "[meta-oauth-smoke] OK — backend is reporting healthy Meta OAuth config."
  echo "Now cross-check that .redirectUri matches BYTE-FOR-BYTE the entry under:"
  echo "  Meta Console -> App -> Facebook Login -> Settings -> Valid OAuth Redirect URIs"
else
  echo "[meta-oauth-smoke] FAIL — see ❌ above and the runbook at docs/runbooks/meta-oauth-setup.md"
  exit 1
fi
