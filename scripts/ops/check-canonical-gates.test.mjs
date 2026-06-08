#!/usr/bin/env node
/**
 * check-canonical-gates.test.mjs
 *
 * Self-contained proof that the worker-coverage + fresh-scan hardening of the
 * canonical gates actually RATCHETS:
 *
 *   1. check-canonical-mind-access.mjs       — scans worker/**, fails on a NEW
 *                                               worker-side direct Mind access.
 *   2. check-canonical-capability-access.mjs — scans worker/**, fails on a NEW
 *                                               worker-side raw-provider send.
 *   3. check-canonical-duplicates.mjs        — runs a FRESH scan and ignores a
 *                                               stale / corrupted committed
 *                                               CAPABILITY_MAP.md on disk.
 *
 * Each case is fail-closed: a temp fixture is created, the gate is run, the
 * exit code is asserted, and the fixture is removed in a finally block so the
 * tree is left byte-identical regardless of pass/fail.
 *
 * Run: node scripts/ops/check-canonical-gates.test.mjs
 * Exit 0 = all assertions held. Exit 1 = a ratchet regressed.
 */

import { spawnSync } from 'node:child_process';
import {
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
  copyFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const MIND_GATE = join(ROOT, 'scripts/ops/check-canonical-mind-access.mjs');
const CAP_GATE = join(ROOT, 'scripts/ops/check-canonical-capability-access.mjs');
const DUP_GATE = join(ROOT, 'scripts/ops/check-canonical-duplicates.mjs');
const CAP_MAP = join(ROOT, 'docs/architecture/CAPABILITY_MAP.md');

let failures = 0;
function check(label, cond) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    console.error(`  FAIL ${label}`);
    failures += 1;
  }
}

function runGate(gate) {
  return spawnSync('node', [gate], { cwd: ROOT, encoding: 'utf8' }).status;
}

// ---------------------------------------------------------------------------
// 0) Baseline: every gate is green on the untouched HEAD tree.
// ---------------------------------------------------------------------------
console.log('[gates.test] HEAD baseline (all gates must be exit 0):');
check('mind gate exit 0 at HEAD', runGate(MIND_GATE) === 0);
check('capability gate exit 0 at HEAD', runGate(CAP_GATE) === 0);
check('duplicates gate exit 0 at HEAD', runGate(DUP_GATE) === 0);

// ---------------------------------------------------------------------------
// 1) Mind gate ratchet — a NEW worker file with a direct Mind access fails.
//    (Built via char-join so this test file itself never trips the gate.)
// ---------------------------------------------------------------------------
const MIND_FIXTURE = join(ROOT, 'worker', '__gatetest_mind__.ts');
// Must use the literal `prisma.` receiver to trip FORBIDDEN_RE, and must NOT
// be preceded by `=` / `??` / `tx.` (which are the idiom exemptions). A bare
// `return prisma.<model>.findMany()` is exactly a non-exempt direct access.
const PRISMA_RECEIVER = 'prisma';
const forbiddenMind =
  'export function probe(' +
  PRISMA_RECEIVER +
  ') { return ' +
  PRISMA_RECEIVER +
  '.' +
  ['kloel', 'Memory'].join('') +
  '.findMany(); }\n';
try {
  writeFileSync(MIND_FIXTURE, forbiddenMind);
  console.log('[gates.test] mind gate worker ratchet:');
  check('mind gate exit 1 on NEW worker direct access', runGate(MIND_GATE) === 1);
} finally {
  rmSync(MIND_FIXTURE, { force: true });
}
check('mind gate exit 0 again after fixture removed', runGate(MIND_GATE) === 0);

// ---------------------------------------------------------------------------
// 2) Capability gate ratchet — a NEW worker file with a raw-provider send fails.
// ---------------------------------------------------------------------------
const CAP_FIXTURE = join(ROOT, 'worker', '__gatetest_cap__.ts');
const rawSend =
  'export function probe(c) { return c.instagramService.' +
  ['send', 'Message'].join('') +
  '({}); }\n';
try {
  writeFileSync(CAP_FIXTURE, rawSend);
  console.log('[gates.test] capability gate worker ratchet:');
  check('capability gate exit 1 on NEW worker raw send', runGate(CAP_GATE) === 1);
} finally {
  rmSync(CAP_FIXTURE, { force: true });
}
check('capability gate exit 0 again after fixture removed', runGate(CAP_GATE) === 0);

// ---------------------------------------------------------------------------
// 3) Duplicates gate freshness — a corrupted on-disk CAPABILITY_MAP.md must NOT
//    change the verdict, because the gate re-scans live source. The OLD gate
//    trusted the on-disk file and would have flagged a bogus 9999-count
//    capability as a regression; the fresh-scan gate stays green.
// ---------------------------------------------------------------------------
if (existsSync(CAP_MAP)) {
  const backup = `${CAP_MAP}.gatetest.bak`;
  copyFileSync(CAP_MAP, backup);
  try {
    const corrupted = readFileSync(CAP_MAP, 'utf8').replace(
      /## CAPABILITY: `([^`]+)` \((\d+) implementations/,
      (_m, cap) => '## CAPABILITY: `' + cap + '` (9999 implementations',
    );
    writeFileSync(CAP_MAP, corrupted);
    console.log('[gates.test] duplicates gate freshness:');
    check(
      'duplicates gate exit 0 despite corrupted on-disk map (re-scanned fresh)',
      runGate(DUP_GATE) === 0,
    );
  } finally {
    copyFileSync(backup, CAP_MAP);
    rmSync(backup, { force: true });
  }
} else {
  console.log('[gates.test] duplicates gate freshness: SKIP (no CAPABILITY_MAP.md)');
}

if (failures > 0) {
  console.error(`\n[gates.test] ${failures} assertion(s) FAILED.`);
  process.exit(1);
}
console.log('\n[gates.test] OK — all canonical-gate ratchets held.');
process.exit(0);
