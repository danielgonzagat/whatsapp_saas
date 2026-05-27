#!/usr/bin/env node
// CEO reconciliation for orphan E8 modifications.
// Snapshot current → restore HEAD → audit → restore current → audit → decide.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const REPO = '/Users/danielpenin/whatsapp_saas-onda0';
const SNAP = '/tmp/ceo-e8-snapshot';
const FILES = [
  'scripts/pulse/__companions__/autopilot-processor.companion.ts',
  'scripts/pulse/__tests__/no-hardcoded-reality.spec.ts',
  'scripts/pulse/adapters/external-sources-orchestrator.ts',
  'scripts/pulse/artifacts.directive.ts',
  'scripts/pulse/chaos-engine.ts',
  'scripts/pulse/otel-runtime.ts',
  'scripts/pulse/parsers/ui-parser.ts',
  'scripts/pulse/scope-engine.ts',
  'scripts/pulse/source-root-detector.ts',
];

function gitShowHead(file) {
  return execFileSync('git', ['show', `HEAD:${file}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
  });
}

function audit() {
  const out = spawnSync(
    'backend/node_modules/.bin/ts-node',
    [
      '--transpile-only',
      '--project', 'scripts/pulse/tsconfig.json',
      '-e',
      'process.stdout.write(""+require("./scripts/pulse/no-hardcoded-reality-audit").auditPulseNoHardcodedReality(process.cwd()).findings.length)',
    ],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 },
  );
  if (out.status !== 0) throw new Error('audit failed: ' + out.stderr);
  const n = Number(out.stdout.trim());
  if (!Number.isFinite(n)) throw new Error('audit non-numeric: ' + out.stdout);
  return n;
}

mkdirSync(SNAP, { recursive: true });

// Step 1: snapshot current modifications
console.log('[1/6] Snapshot current modifications →', SNAP);
for (const f of FILES) {
  const dst = join(SNAP, f);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(join(REPO, f), dst);
}

// Step 2: restore HEAD versions
console.log('[2/6] Restore HEAD versions');
for (const f of FILES) {
  writeFileSync(join(REPO, f), gitShowHead(f));
}

// Step 3: audit HEAD
console.log('[3/6] Audit HEAD …');
const headCount = audit();
console.log('  HEAD findings:', headCount);

// Step 4: restore current modifications
console.log('[4/6] Restore current modifications');
for (const f of FILES) {
  copyFileSync(join(SNAP, f), join(REPO, f));
}

// Step 5: audit current
console.log('[5/6] Audit current …');
const curCount = audit();
console.log('  CURRENT findings:', curCount);

// Step 6: decide
const delta = headCount - curCount;
console.log(`[6/6] Δ = HEAD(${headCount}) - CURRENT(${curCount}) = ${delta}`);
const decision = delta > 0 ? 'COMMIT' : 'REVERT';
console.log('  Decision:', decision);

mkdirSync(join(REPO, 'artifacts/pulse-liquefaction'), { recursive: true });
writeFileSync(
  join(REPO, 'artifacts/pulse-liquefaction/ceo-e8-reconcile-result.json'),
  JSON.stringify({ headCount, curCount, delta, decision, files: FILES }, null, 2),
);

if (decision === 'REVERT') {
  console.log('[revert] Restoring HEAD content for all files');
  for (const f of FILES) {
    writeFileSync(join(REPO, f), gitShowHead(f));
  }
}

console.log('done');
