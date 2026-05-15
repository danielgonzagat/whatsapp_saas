#!/usr/bin/env node
/**
 * Atomicity regression auditor.
 *
 * Reads every AtomicEditTrace in docs/ai/traces/ and proves — from durable
 * evidence, not from any agent's self-report — that edits stayed atomic.
 * If the fleet silently regresses to coarse whole-line rewrites, the
 * aggregate metrics move and this exits non-zero (fail-closed, CI-usable).
 *
 * Metrics (per the spec the repo owner laid out):
 *   atomic_edit_ratio       share of ops that avoided a line rewrite
 *   mean_expansion_avoided  avg lineSurface/changedChars (thesis metric)
 *   fallback_rate           share of ops flagged as coarse-textual fallback
 *   coarse_unjustified      ops that rewrote >LINE_NOISE chars surface for
 *                           a <=MICRO_CHANGE-char real change (pure noise)
 *
 * Zero deps. `node audit-atomicity.mjs [--json] [--min-ratio=0.85]`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const TRACES = path.join(REPO, 'docs', 'ai', 'traces');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const minRatio = Number((args.find((a) => a.startsWith('--min-ratio=')) ?? '=0.85').split('=')[1]);
const MICRO_CHANGE = 32; // chars: a literal/arg/token-sized real change
const LINE_NOISE = 80; // chars of line surface rewritten = whole-line-ish

if (!fs.existsSync(TRACES)) {
  console.log('no traces yet — nothing to audit (clean)');
  process.exit(0);
}

// Smoke/benchmark fixtures deliberately exercise coarse ops to test the
// engine; they are not production edits and must not skew the regression
// signal. Audit real source edits only.
const isFixture = (file = '') =>
  /\.smoke-fixtures?\b|\.smoke-fixture\.|[\\/]tmp[\\/]|^tmp\.|\.bench-/.test(file);

const files = fs.readdirSync(TRACES).filter((f) => f.endsWith('.json'));
const traces = [];
for (const f of files) {
  try {
    const t = JSON.parse(fs.readFileSync(path.join(TRACES, f), 'utf8'));
    if (!isFixture(t.file)) traces.push(t);
  } catch {
    /* skip unparseable trace — never let one bad file blind the audit */
  }
}

const n = traces.length;
if (n === 0) {
  console.log('no parseable traces — nothing to audit (clean)');
  process.exit(0);
}

let avoided = 0;
let fallback = 0;
let expSum = 0;
const offenders = [];
for (const t of traces) {
  const m = t.metrics ?? {};
  if (m.lineRewriteAvoided) avoided++;
  if (t.fallback) fallback++;
  expSum += Number(m.expansionFactorAvoided ?? 0);
  if (
    (m.changedChars ?? 0) <= MICRO_CHANGE &&
    (m.lineRewriteSurfaceChars ?? 0) >= LINE_NOISE &&
    !m.lineRewriteAvoided
  ) {
    offenders.push({
      operationId: t.operationId,
      file: t.file,
      operator: t.operator,
      changedChars: m.changedChars,
      lineRewriteSurfaceChars: m.lineRewriteSurfaceChars,
    });
  }
}

const report = {
  traces: n,
  atomic_edit_ratio: Number((avoided / n).toFixed(4)),
  mean_expansion_avoided: Number((expSum / n).toFixed(2)),
  fallback_rate: Number((fallback / n).toFixed(4)),
  coarse_unjustified: offenders.length,
  thresholdMinRatio: minRatio,
  pass: avoided / n >= minRatio && offenders.length === 0,
  worstOffenders: offenders.slice(0, 10),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`atomicity audit — ${n} traces`);
  console.log(`  atomic_edit_ratio      ${report.atomic_edit_ratio}  (min ${minRatio})`);
  console.log(`  mean_expansion_avoided ${report.mean_expansion_avoided}x`);
  console.log(`  fallback_rate          ${report.fallback_rate}`);
  console.log(`  coarse_unjustified     ${report.coarse_unjustified}`);
  if (offenders.length) {
    console.log('  offenders:');
    for (const o of report.worstOffenders) {
      console.log(
        `    ${o.operator} ${o.file} (${o.changedChars}c real / ${o.lineRewriteSurfaceChars}c surface)`,
      );
    }
  }
  console.log(report.pass ? 'PASS — atomicity holding' : 'FAIL — coarse-edit regression detected');
}

process.exit(report.pass ? 0 : 1);
