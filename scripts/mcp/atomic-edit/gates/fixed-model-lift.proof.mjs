#!/usr/bin/env node
/**
 * fixed-model-lift.proof.mjs
 *
 * Proves the local FixedModelLift benchmark is present, deterministic, honest
 * about scope, and discriminates structured proof feedback from scalar feedback
 * under the same frozen proposer and attempt budget.
 */
import { runFixedModelLiftBench } from '../fixed-model-lift-bench.mjs';

let pass = 0;
let fail = 0;
const results = [];

function check(name, ok, detail = null) {
  const record = { name, ok: Boolean(ok), detail };
  results.push(record);
  if (record.ok) pass += 1;
  else fail += 1;
}

const report = runFixedModelLiftBench();
const baseline = report.arms.baseline;
const scalar = report.arms.scalar;
const proof = report.arms.proof;

check(
  'benchmark is explicitly a mini-HumanEval-style harness, not a HumanEval score',
  report.benchmarkId === 'fixed-model-lift-mini-humaneval-v1' &&
    report.dataset === 'synthetic-mini-humaneval-style' &&
    report.fullHumanEvalClaim === false,
  {
    benchmarkId: report.benchmarkId,
    dataset: report.dataset,
    fullHumanEvalClaim: report.fullHumanEvalClaim,
  },
);
check(
  'all arms use the same frozen proposer and same one-shot budget',
  report.controls.sameFrozenProposer === true &&
    baseline.proposerId === report.controls.proposerId &&
    scalar.proposerId === report.controls.proposerId &&
    proof.proposerId === report.controls.proposerId &&
    baseline.attemptBudget === 1 &&
    scalar.attemptBudget === 1 &&
    proof.attemptBudget === 1,
  report.controls,
);
check(
  'all arms evaluate exactly the same task set',
  baseline.attempts.map((attempt) => attempt.taskId).join('|') ===
    report.controls.sameTaskIds.join('|') &&
    scalar.attempts.map((attempt) => attempt.taskId).join('|') ===
      report.controls.sameTaskIds.join('|') &&
    proof.attempts.map((attempt) => attempt.taskId).join('|') ===
      report.controls.sameTaskIds.join('|'),
  { taskIds: report.controls.sameTaskIds },
);
check(
  'structured proof feedback lifts Pass@1 over baseline for the same proposer',
  proof.passAt1 > baseline.passAt1 && report.deltas.proofMinusBaselinePassAt1 > 0,
  {
    baseline: baseline.passAt1,
    proof: proof.passAt1,
    delta: report.deltas.proofMinusBaselinePassAt1,
  },
);
check(
  'structured proof feedback beats scalar pass/fail under the same proposer',
  proof.passAt1 > scalar.passAt1 && scalar.passAt1 === baseline.passAt1,
  { scalar: scalar.passAt1, baseline: baseline.passAt1, proof: proof.passAt1 },
);
check(
  'proof arm reaches full local pass@1 while baseline still has real failures',
  proof.passAt1 === 1 && baseline.failed > 0,
  { baselineFailed: baseline.failed, proofFailed: proof.failed },
);
check(
  'proof feedback removes repeat collisions with known walls',
  proof.wallRepeatRate === 0 && baseline.wallRepeatRate > proof.wallRepeatRate,
  {
    baselineWallRepeatRate: baseline.wallRepeatRate,
    proofWallRepeatRate: proof.wallRepeatRate,
  },
);
check(
  'cost per pass improves without novelty collapse',
  proof.costPerPass < baseline.costPerPass && proof.noveltyIndex >= baseline.noveltyIndex,
  {
    baselineCostPerPass: baseline.costPerPass,
    proofCostPerPass: proof.costPerPass,
    baselineNovelty: baseline.noveltyIndex,
    proofNovelty: proof.noveltyIndex,
  },
);
check(
  'bench is local and deterministic: no external model or network calls',
  report.controls.externalModelCalls === 0 && report.controls.networkRequired === false,
  {
    externalModelCalls: report.controls.externalModelCalls,
    networkRequired: report.controls.networkRequired,
  },
);
check(
  'digests bind the frozen suite and proof feedback artifacts',
  /^[a-f0-9]{64}$/.test(report.suiteDigest) && /^[a-f0-9]{64}$/.test(report.proofFeedbackDigest),
  { suiteDigest: report.suiteDigest, proofFeedbackDigest: report.proofFeedbackDigest },
);
check(
  'scope limits explicitly forbid selling this as HumanEval or MBPP evidence',
  report.proofLimits.some((line) => line.includes('not a HumanEval')) &&
    report.proofLimits.some((line) => line.includes('external dataset/model adapter')),
  report.proofLimits,
);

const payload = { ok: fail === 0, pass, fail, report, results };
if (process.argv.includes('--json')) console.log(JSON.stringify(payload, null, 2));
else {
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`);
  console.log(`${pass} passed, ${fail} failed`);
}
process.exit(fail === 0 ? 0 : 1);
