#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
# Use global binary (gitnexus@1.6.5) — npx broken with Node 25
exec gitnexus mcp
