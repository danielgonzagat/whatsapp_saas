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

// Top-20 controller files from tier-1-production-plan.md item #8.
// Each entry maps to the expected controller source.
const TOP20_CTRLS = [
  { file: 'backend/src/auth/auth.controller.ts', name: 'auth' },
  { file: 'backend/src/workspaces/workspace.controller.ts', name: 'workspaces' },
  { file: 'backend/src/products/products.controller.ts', name: 'products' },
  { file: 'backend/src/checkout/checkout.controller.ts', name: 'checkout' },
  { file: 'backend/src/checkout/checkout-public.controller.ts', name: 'checkout-public' },
  { file: 'backend/src/webhooks/payment-webhook-stripe.controller.ts', name: 'stripe-webhook' },
  { file: 'backend/src/payments/mercadopago/mercadopago-webhook.controller.ts', name: 'mercadopago-webhook' },
  { file: 'backend/src/whatsapp/whatsapp.controller.ts', name: 'whatsapp' },
  { file: 'backend/src/meta/webhooks/meta-webhook.controller.ts', name: 'meta-webhook' },
  { file: 'backend/src/affiliate/affiliate.controller.ts', name: 'affiliate' },
  { file: 'backend/src/kyc/kyc.controller.ts', name: 'kyc' },
  { file: 'backend/src/gdpr/data-delete.controller.ts', name: 'gdpr-delete' },
  { file: 'backend/src/gdpr/data-export.controller.ts', name: 'gdpr-export' },
  { file: 'backend/src/health/health.controller.ts', name: 'health' },
  { file: 'backend/src/health/system-health.controller.ts', name: 'sys-health' },
  { file: 'backend/src/billing/billing.controller.ts', name: 'billing' },
];

/** Scan a controller source file for @ApiOperation coverage per HTTP method. */
function scanController(relPath) {
  const absPath = resolve(REPO_ROOT, relPath);
  let src;
  try { src = readFileSync(absPath, 'utf8'); } catch { return null; }

  const HTTP_RE = /  @(Get|Post|Put|Patch|Delete)\(/g;
  const methods = [];
  let m;
  while ((m = HTTP_RE.exec(src))) {
    const httpPos = m.index;
    const verb = m[1];
    // Look backwards up to 600 chars for @ApiOperation
    const before = src.substring(Math.max(0, httpPos - 600), httpPos);
    const hasOp = /@ApiOperation\(/.test(before);
    // Extract method name
    const after = src.substring(httpPos, httpPos + 800);
    const nameMatch = after.match(/async\s+(\w+)\s*\(/);
    methods.push({ verb, methodName: nameMatch ? nameMatch[1] : 'unknown', hasApiOperation: hasOp });
  }
  return methods;
}

// ── Main ──

// Read spec to discover which controllers actually registered routes
let specFiles = new Set();
if (existsSync(SPEC)) {
  const spec = JSON.parse(readFileSync(SPEC, 'utf8'));
  for (const methods of Object.values(spec.paths ?? {})) {
    for (const op of Object.values(methods)) {
      if (op['x-controller-file']) specFiles.add(op['x-controller-file']);
    }
  }
}

console.log('='.repeat(60));
console.log('OpenAPI @ApiOperation Coverage — Top-20 Production Endpoints');
console.log('='.repeat(60));
console.log();

let totalCovered = 0;
let totalMethods = 0;

for (const ctrl of TOP20_CTRLS) {
  const methods = scanController(ctrl.file);
  if (!methods) {
    console.log(`  ${ctrl.name.padEnd(22)} — FILE NOT FOUND`);
    continue;
  }

  const covered = methods.filter((m) => m.hasApiOperation).length;
  const tot = methods.length;
  totalCovered += covered;
  totalMethods += tot;

  const pct = tot > 0 ? ((covered / tot) * 100).toFixed(0) : 'N/A';
  const inSpec = specFiles.has(ctrl.file) ? '✓' : '✗';
  console.log(`  ${ctrl.name.padEnd(22)} ${String(covered).padStart(2)}/${String(tot).padEnd(3)} ${String(pct + '%').padStart(4)}  [spec: ${inSpec}]`);

  if (tot > 0 && covered < tot) {
    const missing = methods.filter((m) => !m.hasApiOperation);
    for (const m of missing) {
      console.log(`    └─ missing: ${m.verb.toUpperCase().padEnd(6)} ${m.methodName}`);
    }
  }
}

console.log();
console.log('-'.repeat(60));

const overall = totalMethods > 0 ? (totalCovered / totalMethods) * 100 : 0;
console.log(`  OVERALL:   ${totalCovered}/${totalMethods} (${overall.toFixed(1)}%)`);
console.log(`  THRESHOLD: ${threshold}%`);
console.log(`  RESULT:    ${overall >= threshold ? 'PASS' : 'FAIL'}`);
console.log('='.repeat(60));

if (reportOnly) process.exit(0);

if (overall < threshold) {
  console.error();
  console.error(`ERROR: OpenAPI @ApiOperation coverage is ${overall.toFixed(1)}%, below ${threshold}%.`);
  console.error('Add @ApiOperation decorators to the missing methods listed above.');
  process.exit(1);
}
