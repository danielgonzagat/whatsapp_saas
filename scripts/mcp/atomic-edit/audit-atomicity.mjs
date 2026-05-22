#!/usr/bin/env node
/**
 * Atomicity regression auditor.
 *
 * Reads every AtomicEditTrace in .atomic/traces/ and proves — from durable
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
 *   topologyCoverage        share of traces proving preservation topology
 *   missingTopology         traces lacking targetUnit / semanticImpact /
 *                           preservedZones / modifiedZones proof
 *   previewTraceCount      traces submitted with preview:true
 *   dishonestPreviewCount  preview traces that look like committed writes
 *   dishonestPreviews      details of each dishonest preview offender
 *
 * Zero deps. `node audit-atomicity.mjs [--json] [--strict-ratio] [--strict-topology] [--strict-current-topology] [--since=<ISO|epoch-ms>] [--min-ratio=0.85] [--self-test]`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSelfTestCases } from './audit-atomicity.test-cases.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const TRACES = path.join(REPO, '.atomic', 'traces');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const strictRatio = args.includes('--strict-ratio');
const strictTopology = args.includes('--strict-topology');
const strictCurrentTopology = args.includes('--strict-current-topology');
const sinceRaw = args.find((a) => a.startsWith('--since='))?.slice('--since='.length) ?? null;
const sinceMs = parseSince(sinceRaw);
const minRatio = Number((args.find((a) => a.startsWith('--min-ratio=')) ?? '=0.85').split('=')[1]);
const MICRO_CHANGE = 32; // chars: a literal/arg/token-sized real change
const LINE_NOISE = 80; // chars of line surface rewritten = whole-line-ish

function parseSince(raw) {
  if (!raw) return null;
  const numeric = Number(raw);
  const parsed = Number.isFinite(numeric) ? numeric : Date.parse(raw);
  if (Number.isFinite(parsed)) return parsed;
  console.error(`invalid --since value: ${raw}`);
  process.exit(2);
}

// Smoke/benchmark fixtures deliberately exercise coarse ops to test the
// engine; they are not production edits and must not skew the regression
// signal. Audit real source edits only.
const isFixture = (file = '') =>
  /\.smoke-fixtures?\b|\.smoke-fixture\.|\.smoke-tx-|[\\/]tmp[\\/]|^tmp\.|^a\.ts$|\.bench-/.test(
    file,
  );

function traceTopology(t) {
  const nested = t.preservationTopology ?? t.topology ?? {};
  return {
    targetUnit: t.targetUnit ?? nested.targetUnit,
    semanticImpact: t.semanticImpact ?? nested.semanticImpact,
    preservedZones: t.preservedZones ?? nested.preservedZones,
    modifiedZones: t.modifiedZones ?? nested.modifiedZones,
    movementZones: t.movementZones ?? nested.movementZones,
  };
}

function traceHasTopology(t) {
  const topology = traceTopology(t);
  return (
    typeof topology.targetUnit === 'string' &&
    topology.targetUnit.length > 0 &&
    typeof topology.semanticImpact === 'string' &&
    topology.semanticImpact.length > 0 &&
    Array.isArray(topology.preservedZones) &&
    topology.preservedZones.length > 0 &&
    Array.isArray(topology.modifiedZones) &&
    topology.modifiedZones.length > 0 &&
    (topology.movementZones === undefined || Array.isArray(topology.movementZones))
  );
}

function traceIsDishonestPreview(t) {
  if (!t.preview) return false;
  return t.changed !== false || Boolean(t.rollback?.available) || Boolean(t.rollbackAvailable);
}

function evaluateTrace(t) {
  const m = t.metrics ?? {};
  const changedChars = Number(m.changedChars ?? 0);
  const lineRewriteSurfaceChars = Number(m.lineRewriteSurfaceChars ?? 0);
  const expansionFactorAvoided = Number(m.expansionFactorAvoided ?? 0);
  const operator = String(t.operator ?? t.operation ?? '');
  const fallback = Boolean(t.fallback);
  const traceProvesAtomic = !fallback && operator.startsWith('atomic') && expansionFactorAvoided > 1;
  const lineRewriteAvoided = Boolean(m.lineRewriteAvoided) || traceProvesAtomic;
  const isOffender = changedChars <= MICRO_CHANGE && lineRewriteSurfaceChars >= LINE_NOISE && !lineRewriteAvoided;

  return {
    operationId: t.operationId,
    file: t.file,
    operator,
    fallback,
    changedChars,
    lineRewriteSurfaceChars,
    expansionFactorAvoided,
    lineRewriteAvoided,
    isOffender,
    hasTopology: traceHasTopology(t),
    isPreview: Boolean(t.preview),
    isDishonestPreview: traceIsDishonestPreview(t),
    ts: t.ts,
    tsMs: Number.isFinite(Date.parse(t.ts ?? '')) ? Date.parse(t.ts ?? '') : null,
  };
}

function auditTraces(traces, options = {}) {
  const shouldStrictRatio = options.strictRatio ?? strictRatio;
  const shouldStrictTopology = options.strictTopology ?? strictTopology;
  const shouldStrictCurrentTopology = options.strictCurrentTopology ?? strictCurrentTopology;
  const traceResults = traces.map(evaluateTrace);
  const n = traceResults.length;
  if (n === 0) return { empty: true, report: null, traceResults };

  const avoided = traceResults.filter((t) => t.lineRewriteAvoided).length;
  const fallback = traceResults.filter((t) => t.fallback).length;
  const expSum = traceResults.reduce((sum, t) => sum + t.expansionFactorAvoided, 0);
  const offenders = traceResults.filter((t) => t.isOffender);
  const enforcementPass = fallback === 0 && offenders.length === 0;
  const previewTraceCount = traceResults.filter((t) => t.isPreview).length;
  const dishonestPreviewResults = traceResults.filter((t) => t.isDishonestPreview);
  const dishonestPreviews = dishonestPreviewResults.map((t) => ({
    operationId: t.operationId,
    file: t.file,
    operator: t.operator,
    ts: t.ts,
  }));
  const dishonestPreviewCount = dishonestPreviews.length;
  const previewHonestyPass = dishonestPreviewCount === 0;
  const ratioPass = avoided / n >= minRatio;
  const topologyCount = traceResults.filter((t) => t.hasTopology).length;
  const topologyCoverage = Number((topologyCount / n).toFixed(4));
  const topologyPass = topologyCount === n;
  const missingTopologyResults = traceResults.filter((t) => !t.hasTopology);
  const missingTopology = missingTopologyResults.map((t) => ({
    operationId: t.operationId,
    file: t.file,
    ts: t.ts,
  }));
  const topologyEpochMs = traceResults
    .filter((t) => t.hasTopology && typeof t.tsMs === 'number')
    .reduce((earliest, t) => Math.min(earliest, t.tsMs), Number.POSITIVE_INFINITY);
  const hasTopologyEpoch = Number.isFinite(topologyEpochMs);
  const currentTraceResults = hasTopologyEpoch
    ? traceResults.filter((t) => typeof t.tsMs === 'number' && t.tsMs >= topologyEpochMs)
    : [];
  const currentMissingTopologyResults = currentTraceResults.filter((t) => !t.hasTopology);
  const currentMissingTopology = currentMissingTopologyResults.map((t) => ({
    operationId: t.operationId,
    file: t.file,
    ts: t.ts,
  }));
  const legacyMissingTopology = missingTopologyResults
    .filter((t) => !hasTopologyEpoch || typeof t.tsMs !== 'number' || t.tsMs < topologyEpochMs)
    .map((t) => ({ operationId: t.operationId, file: t.file, ts: t.ts }));
  const currentTopologyCount = currentTraceResults.filter((t) => t.hasTopology).length;
  const currentTopologyCoverage = currentTraceResults.length
    ? Number((currentTopologyCount / currentTraceResults.length).toFixed(4))
    : null;
  const currentTopologyPass = currentTraceResults.length > 0 && currentMissingTopology.length === 0;
  const pass =
    enforcementPass &&
    previewHonestyPass &&
    (!shouldStrictRatio || ratioPass) &&
    (!shouldStrictTopology || topologyPass) &&
    (!shouldStrictCurrentTopology || currentTopologyPass);

  return {
    empty: false,
    traceResults,
    report: {
      traces: n,
      atomic_edit_ratio: Number((avoided / n).toFixed(4)),
      mean_expansion_avoided: Number((expSum / n).toFixed(2)),
      fallback_rate: Number((fallback / n).toFixed(4)),
      coarse_unjustified: offenders.length,
      thresholdMinRatio: minRatio,
      since: typeof options.sinceMs === 'number' ? new Date(options.sinceMs).toISOString() : null,
      strictRatio: shouldStrictRatio,
      strictTopology: shouldStrictTopology,
      strictCurrentTopology: shouldStrictCurrentTopology,
      previewTraceCount,
      dishonestPreviewCount,
      dishonestPreviews,
      previewHonestyPass,
      enforcementPass,
      ratioPass,
      topologyCoverage,
      topologyPass,
      topologySchemaFirstSeenAt: hasTopologyEpoch ? new Date(topologyEpochMs).toISOString() : null,
      currentTraceCount: currentTraceResults.length,
      currentTopologyCoverage,
      currentTopologyPass,
      staleTopologyEmitterSuspected: currentMissingTopology.length > 0,
      missingTopology,
      legacyMissingTopology,
      currentMissingTopology,
      pass,
      worstOffenders: offenders.slice(0, 10).map((t) => ({
        operationId: t.operationId,
        file: t.file,
        operator: t.operator,
        changedChars: t.changedChars,
        lineRewriteSurfaceChars: t.lineRewriteSurfaceChars,
      })),
    },
  };
}

function loadTraceDirectory(tracesDir, options = {}) {
  if (!fs.existsSync(tracesDir)) return { empty: true, report: null, traceResults: [] };

  const traces = [];
  for (const f of fs.readdirSync(tracesDir).filter((name) => name.endsWith('.json'))) {
    try {
      const t = JSON.parse(fs.readFileSync(path.join(tracesDir, f), 'utf8'));
      if (!isFixture(t.file)) traces.push(t);
    } catch {
      /* skip unparseable trace - never let one bad file blind the audit */
    }
  }
  const windowedTraces =
    typeof options.sinceMs === 'number'
      ? traces.filter((t) => {
          const tsMs = Date.parse(t.ts ?? '');
          return Number.isFinite(tsMs) && tsMs >= options.sinceMs;
        })
      : traces;
  return auditTraces(windowedTraces, options);
}


async function writeJsonAndExit(value, exitCode) {
  await new Promise((resolve, reject) => {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  process.exit(exitCode);
}

if (args.includes('--self-test')) {
  const selfTestOptions = { strictRatio: false, strictTopology: false, strictCurrentTopology: false };
  const cases = buildSelfTestCases().map((selfTestCase) => {
    const audit = auditTraces([selfTestCase.trace], selfTestOptions);
    const passMatches = audit.report.pass === selfTestCase.expectedPass;
    const topologyMatches =
      selfTestCase.expectedTopologyPass === undefined ||
      audit.report.topologyPass === selfTestCase.expectedTopologyPass;
    const previewMatches =
      selfTestCase.expectedPreviewHonestyPass === undefined ||
      audit.report.previewHonestyPass === selfTestCase.expectedPreviewHonestyPass;
    const passed = passMatches && topologyMatches && previewMatches;
    return {
      name: selfTestCase.name,
      expectedPreviewHonestyPass: selfTestCase.expectedPreviewHonestyPass,
      expectedPass: selfTestCase.expectedPass,
      expectedTopologyPass: selfTestCase.expectedTopologyPass,
      passed,
      report: audit.report,
    };
  });
  const aggregate = auditTraces(
    buildSelfTestCases().map((selfTestCase) => selfTestCase.trace),
    selfTestOptions,
  ).report;
  const selfTestPass = cases.every((selfTestCase) => selfTestCase.passed);

  if (asJson) {
    await writeJsonAndExit({ selfTestPass, cases, aggregate }, selfTestPass ? 0 : 1);
  } else {
    console.log(`self-test: ${selfTestPass ? 'PASS' : 'FAIL'} (${cases.filter((c) => c.passed).length}/${cases.length})`);
    for (const c of cases) console.log(`  ${c.name}: ${c.passed ? 'PASS' : 'FAIL'}`);
    process.exit(selfTestPass ? 0 : 1);
  }
}

const audit = loadTraceDirectory(TRACES, { sinceMs });
if (audit.empty) {
  console.log(fs.existsSync(TRACES) ? 'no parseable traces — nothing to audit (clean)' : 'no traces yet — nothing to audit (clean)');
  process.exit(0);
}

const { report } = audit;
const { enforcementPass, ratioPass, topologyPass, currentTopologyPass, previewHonestyPass, pass } = report;

if (asJson) {
  await writeJsonAndExit(report, pass ? 0 : 1);
} else {
  console.log(`atomicity audit — ${report.traces} traces`);
  if (report.since) console.log(`  since                  ${report.since}`);
  console.log(
    `  atomic_edit_ratio      ${report.atomic_edit_ratio}  (min ${minRatio})${strictRatio ? ' [strict]' : ''}`,
  );
  console.log(`  mean_expansion_avoided ${report.mean_expansion_avoided}x`);
  console.log(`  fallback_rate          ${report.fallback_rate}`);
  console.log(`  coarse_unjustified     ${report.coarse_unjustified}`);
  console.log(`  enforcementPass        ${enforcementPass}`);
  console.log(`  previewTraceCount    ${report.previewTraceCount}`);
  console.log(`  dishonestPreviewCount ${report.dishonestPreviewCount}`);
  console.log(`  previewHonestyPass   ${previewHonestyPass}`);
  console.log(`  ratioPass              ${ratioPass}`);
  console.log(`  topologyCoverage       ${report.topologyCoverage}${strictTopology ? ' [strict]' : ''}`);
  console.log(`  topologyPass           ${topologyPass}`);
  console.log(`  topologyFirstSeen      ${report.topologySchemaFirstSeenAt ?? 'none'}`);
  console.log(`  currentTopologyCoverage ${report.currentTopologyCoverage ?? 'n/a'}${strictCurrentTopology ? ' [strict]' : ''}`);
  console.log(`  currentTopologyPass    ${currentTopologyPass}`);
  console.log(`  currentMissingTopology ${report.currentMissingTopology.length}`);
  console.log(`  legacyMissingTopology  ${report.legacyMissingTopology.length}`);
  if (report.missingTopology.length) {
    console.log('  missing topology:');
    for (const item of report.missingTopology.slice(0, 10)) {
      console.log(`    ${item.file} (${item.operationId})`);
    }
  }
  if (report.dishonestPreviews.length) {
    console.log('  dishonest previews:');
    for (const item of report.dishonestPreviews.slice(0, 10)) {
      console.log(`    ${item.file} (${item.operationId})`);
    }
  }
  if (report.worstOffenders.length) {
    console.log('  offenders:');
    for (const o of report.worstOffenders) {
      console.log(
        `    ${o.operator} ${o.file} (${o.changedChars}c real / ${o.lineRewriteSurfaceChars}c surface)`,
      );
    }
  }
  if (!previewHonestyPass) {
    console.log('FAIL — dishonest preview trace detected');
  } else if (!enforcementPass) {
    console.log('FAIL — coarse-edit regression detected');
  } else if (!ratioPass) {
    if (strictRatio) {
      console.log('FAIL — ratio below threshold in strict-ratio mode');
    } else {
      console.log(
        'PASS — enforcement holds (ratio below threshold, advisory only; use --strict-ratio to fail on ratio)',
      );
    }
  } else if (strictCurrentTopology && !currentTopologyPass) {
    console.log('FAIL — current topology coverage incomplete in strict-current-topology mode');
  } else if (!topologyPass) {
    if (strictTopology) {
      console.log('FAIL — topology coverage incomplete in strict-topology mode');
    } else {
      console.log(
        'PASS — enforcement holds (topology coverage incomplete, advisory only; use --strict-topology to fail on topology)',
      );
    }
  } else {
    console.log('PASS — atomicity holding');
  }
}

process.exit(pass ? 0 : 1);
