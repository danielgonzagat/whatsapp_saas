#!/usr/bin/env bash
set -euo pipefail
echo 'Running PULSE re-cert...'
npx ts-node --transpile-only --project scripts/pulse/tsconfig.json scripts/pulse/index.ts --report
node scripts/dev/check-pulse-status.mjs
