#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." >/dev/null 2>&1 && pwd)"
ENV_FILE="${REPO_ROOT}/.env.pulse.local"
MCP_CHECK="${SCRIPT_DIR}/check-stripe-mcp.sh"
JEST_JSON_FILE="$(mktemp "${TMPDIR:-/tmp}/stripe-auth.XXXXXX.json")"
JEST_LOG_FILE="$(mktemp "${TMPDIR:-/tmp}/stripe-auth.XXXXXX.log")"

cleanup() {
  rm -f "${JEST_JSON_FILE}" "${JEST_LOG_FILE}"
}

trap cleanup EXIT

if [[ ! -x "${MCP_CHECK}" ]]; then
  echo "status=error" >&2
  echo "reason=mcp_check_not_executable" >&2
  exit 1
fi

node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const mcpPath = path.join(repoRoot, '.mcp.json');
const claudeSettingsPath = path.join(repoRoot, '.claude', 'settings.json');

const fail = (reason) => {
  console.error('status=error');
  console.error(`reason=${reason}`);
  process.exit(1);
};

if (!fs.existsSync(mcpPath)) fail('missing_mcp_json');

const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
const stripeServer = mcp?.mcpServers?.stripe;

if (!stripeServer || stripeServer.command !== 'bash') fail('stripe_mcp_entry_missing');

const launcherArgs = Array.isArray(stripeServer.args) ? stripeServer.args : [];
if (!launcherArgs.includes('scripts/mcp/stripe-mcp-launcher.sh')) fail('stripe_launcher_not_registered');

console.log('mcp_config=ok');

if (!fs.existsSync(claudeSettingsPath)) {
  console.log('claude_plugin=unknown');
  process.exit(0);
}

const settings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));
const enabledPlugins = settings?.enabledPlugins ?? {};
const stripePlugin = enabledPlugins['stripe@claude-plugins-official'];

console.log(`claude_plugin=${stripePlugin === true ? 'enabled' : 'disabled'}`);
NODE

"${MCP_CHECK}"

set -a
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}" >/dev/null 2>&1
fi
set +a

npm --prefix backend run test -- \
  --runInBand \
  src/billing/stripe.service.spec.ts \
  -t "retrieveBalance\\(\\) succeeds against Stripe test mode" \
  --json \
  --outputFile "${JEST_JSON_FILE}" \
  >"${JEST_LOG_FILE}" 2>&1

REPORT_PATH="${JEST_JSON_FILE}" node --input-type=module <<'NODE'
import fs from 'node:fs';

const reportPath = process.env.REPORT_PATH;
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const targetName = 'retrieveBalance() succeeds against Stripe test mode';
const testResult = report.testResults
  .flatMap((suite) => suite.assertionResults)
  .find((assertion) => assertion.title === targetName);

if (!report.success) {
  console.error('status=error');
  console.error('reason=stripe_auth_test_failed');
  process.exit(1);
}

if (!testResult || testResult.status !== 'passed') {
  console.error('status=error');
  console.error('reason=stripe_auth_test_not_executed');
  process.exit(1);
}

console.log('stripe_auth=ok');
console.log(`stripe_auth_duration_ms=${testResult.duration ?? 0}`);
NODE

echo "status=ok"
