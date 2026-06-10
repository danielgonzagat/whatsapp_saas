#!/usr/bin/env node
/**
 * human-eval-lift-protocol.proof.mjs
 *
 * Proves the HumanEval-format fixed-model lift runner is executable, honest
 * about official-score limits, and detects a proof-feedback Pass@1 lift for
 * the same frozen fixture model under the same task/budget controls.
 */
import { runHumanEvalLiftBench } from '../human-eval-lift-runner.mjs';

const jsonMode = process.argv.includes('--json');
const report = runHumanEvalLiftBench();
const forgedOfficial = runHumanEvalLiftBench({ claimOfficialHumanEval: true });
const results = [];

function check(name, ok, detail = undefined) {
  results.push({ name, ok: Boolean(ok), detail });
}

const baseline = report.arms.baseline;
const scalar = report.arms.scalar;
const proof = report.arms.proof;

check('runner accepts HumanEval-shaped tasks and executes Python tests', report.ok && report.formatCompatible && report.pythonAvailable, {
  datasetKind: report.datasetKind,
  taskCount: report.taskCount,
  pythonAvailable: report.pythonAvailable,
});
check('bundled fixture is explicitly not an official HumanEval claim', report.datasetKind === 'fixture-humaneval-format' && report.fullHumanEvalClaim === false, {
  datasetKind: report.datasetKind,
  fullHumanEvalClaim: report.fullHumanEvalClaim,
});
check('forged official HumanEval claim is refused on fixture data', forgedOfficial.officialClaimRefused === true && forgedOfficial.fullHumanEvalClaim === false, {
  officialClaimRefused: forgedOfficial.officialClaimRefused,
  fullHumanEvalClaim: forgedOfficial.fullHumanEvalClaim,
});
check('all arms use the same fixed model id and one-shot budget', report.controls.sameFixedModel && report.controls.sameAttemptBudget, report.controls);
check('runner performs no model or network calls during evaluation', report.controls.externalModelCalls === 0 && report.controls.networkRequired === false, report.controls);
check('structured proof feedback lifts Pass@1 over baseline on HumanEval-format Python tasks', proof.passAt1 > baseline.passAt1 && report.deltas.proofMinusBaselinePassAt1 > 0, {
  baseline: baseline.passAt1,
  proof: proof.passAt1,
  delta: report.deltas.proofMinusBaselinePassAt1,
});
check('structured proof feedback beats scalar pass/fail under the same fixed model', proof.passAt1 > scalar.passAt1 && scalar.passAt1 === baseline.passAt1, {
  scalar: scalar.passAt1,
  baseline: baseline.passAt1,
  proof: proof.passAt1,
});
check('proof arm reaches full fixture pass@1 while baseline has real Python assertion failures', proof.passAt1 === 1 && proof.failed === 0 && baseline.failed > 0, {
  baselineFailed: baseline.failed,
  proofFailed: proof.failed,
});
check('repeated wall collisions drop to zero under proof feedback', baseline.wallRepeatRate > proof.wallRepeatRate && proof.wallRepeatRate === 0, {
  baselineWallRepeatRate: baseline.wallRepeatRate,
  proofWallRepeatRate: proof.wallRepeatRate,
});
check('dataset and sample digests bind the benchmark artifacts', /^[a-f0-9]{64}$/.test(report.datasetSha256) && /^[a-f0-9]{64}$/.test(report.samplesSha256), {
  datasetSha256: report.datasetSha256,
  samplesSha256: report.samplesSha256,
});
check('proof limits require external dataset/model samples before any official HumanEval claim', report.proofLimits.some((line) => line.includes('Official HumanEval claims require an external JSONL dataset')), report.proofLimits);

const payload = { ok: results.every((entry) => entry.ok), pass: results.filter((entry) => entry.ok).length, fail: results.filter((entry) => !entry.ok).length, report, results };
if (jsonMode) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
else for (const entry of results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
process.exit(payload.ok ? 0 : 1);
