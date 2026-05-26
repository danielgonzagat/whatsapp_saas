#!/usr/bin/env node
/**
 * Check OpenAPI annotation coverage on the top-20 production endpoints.
 *
 * Reads `tools/openapi/openapi-spec.json` and inspects whether each top-20
 * endpoint has a non-default @ApiOperation summary (i.e. a real description
 * beyond the auto-generated "METHOD /path" placeholder from openapi-extract).
 *
 * CI gate: fails if coverage on the top-20 set is below the configured threshold
 * (default 70%).
 *
 * Usage:
 *   node scripts/ops/check-openapi-coverage.mjs              (exit 1 if < 70%)
 *   node scripts/ops/check-openapi-coverage.mjs --threshold=80
 *   node scripts/ops/check-openapi-coverage.mjs --report     (print + exit 0)
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..', '..');
const SPEC = resolve(REPO_ROOT, 'tools/openapi/openapi-spec.json');

const args = process.argv.slice(2);
const threshold = parseInt(
  (args.find((a) => a.startsWith('--threshold=')) ?? '--threshold=70').split('=')[1],
  10,
);
const reportOnly = args.includes('--report');

// Top-20 production endpoints per docs/audits/W27/tier-1-production-plan.md item #8.
// Listed as path patterns (matching the OpenAPI spec paths after :id → {id} conversion).
const TOP_20 = [
  // auth (3)
  { method: 'post', path: '/auth/register' },
  { method: 'post', path: '/auth/login' },
  { method: 'get', path: '/auth/check-email' },
  // workspaces (2)
  { method: 'post', path: '/workspaces' },
  { method: 'get', path: '/workspaces/me' },
  // products (1)
  { method: 'post', path: '/products' },
  // checkout (1)
  { method: 'post', path: '/checkout/orders' },
  // payment webhooks (2)
  { method: 'post', path: '/webhook/payment' },
  { method: 'post', path: '/webhooks/mercadopago' },
  // whatsapp (3)
  { method: 'get', path: '/whatsapp/session/status' },
  { method: 'post', path: '/whatsapp/messages' },
  { method: 'post', path: '/webhooks/meta' },
  // affiliate (2)
  { method: 'post', path: '/affiliate/programs' },
  { method: 'get', path: '/affiliate/dashboard' },
  // kyc (2)
  { method: 'post', path: '/kyc/submit' },
  { method: 'get', path: '/kyc/status' },
  // gdpr (2)
  { method: 'post', path: '/gdpr/delete' },
  { method: 'post', path: '/gdpr/export' },
  // health (1)
  { method: 'get', path: '/health/readiness' },
  // billing (1)
  { method: 'post', path: '/billing/subscriptions' },
];

if (!existsSync(SPEC)) {
  console.error(`[openapi-cov] missing ${SPEC}. Run: node scripts/cognitive/openapi-extract.mjs`);
  process.exit(2);
}

const spec = JSON.parse(readFileSync(SPEC, 'utf8'));
const paths = spec.paths ?? {};

// Find a path entry tolerantly: exact match, then prefix match, then substring of method
function findOp(target) {
  // exact path lookup
  if (paths[target.path]?.[target.method]) {
    return paths[target.path][target.method];
  }
  // tolerant: any path that endsWith the target.path (catches version prefixes)
  for (const [p, methods] of Object.entries(paths)) {
    if (p.endsWith(target.path) && methods[target.method]) {
      return methods[target.method];
    }
  }
  return null;
}

function hasRealSummary(op) {
  if (!op) return false;
  const summary = (op.summary || '').trim();
  if (!summary) return false;
  // placeholders we emit: "GET /api/foo", "POST /api/foo"
  const placeholder = /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+\//i;
  if (placeholder.test(summary)) return false;
  return true;
}

let documented = 0;
const undocumented = [];
const missing = [];

for (const target of TOP_20) {
  const op = findOp(target);
  if (!op) {
    missing.push(target);
    continue;
  }
  if (hasRealSummary(op)) {
    documented += 1;
  } else {
    undocumented.push(target);
  }
}

const total = TOP_20.length;
const coverage = total > 0 ? (documented / total) * 100 : 0;

console.log(`OpenAPI coverage on top-20 production endpoints:`);
console.log(`  documented:   ${documented}/${total}`);
console.log(`  undocumented: ${undocumented.length}`);
console.log(`  missing:      ${missing.length}`);
console.log(`  coverage:     ${coverage.toFixed(1)}% (threshold ${threshold}%)`);

if (undocumented.length > 0) {
  console.log('\nUndocumented (have route, missing @ApiOperation summary):');
  for (const t of undocumented) console.log(`  ${t.method.toUpperCase().padEnd(7)} ${t.path}`);
}
if (missing.length > 0) {
  console.log('\nMissing from spec entirely (route not in tools/openapi/openapi-spec.json):');
  for (const t of missing) console.log(`  ${t.method.toUpperCase().padEnd(7)} ${t.path}`);
}

if (reportOnly) process.exit(0);
if (coverage < threshold) {
  console.error(`\n[openapi-cov] FAIL: coverage ${coverage.toFixed(1)}% < threshold ${threshold}%`);
  process.exit(1);
}
console.log(`\n[openapi-cov] PASS: coverage ${coverage.toFixed(1)}% >= ${threshold}%`);
