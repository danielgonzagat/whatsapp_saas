#!/usr/bin/env node
/**
 * human-eval-lift-protocol.proof.mjs
 *
 * Proves the HumanEval-format fixed-model lift runner is executable, honest
 * about official-score limits, and detects a proof-feedback Pass@1 lift for
 * the same frozen fixture model under the same task/budget controls.
 */
import {
  buildProofFeedbackPackages,
  buildProofFeedbackRepairPrompts,
  getFixtureHumanEvalLiftInputs,
  runHumanEvalLiftBench,
  validateProofFeedbackPackage,
  verifyToolAugmentedSamples,
} from '../human-eval-lift-runner.mjs';

const jsonMode = process.argv.includes('--json');
const report = runHumanEvalLiftBench();
const forgedOfficial = runHumanEvalLiftBench({ claimOfficialHumanEval: true });
const emittedFeedbackPackages = buildProofFeedbackPackages({ sourceArm: 'baseline' });
const emittedRepairPrompts = buildProofFeedbackRepairPrompts({ sourceArm: 'baseline' });
const forgedFeedbackPackage = validateProofFeedbackPackage({
  task_id: 'HumanEval/fixture_add',
  arm: 'proof',
  feedback_source: 'atomic-proof-feedback',
  proof_feedback_package: {
    version: 'atomic-proof-feedback-v1',
    task_id: 'HumanEval/fixture_add',
    invariantId: 'unit.counterexample.add',
    counterexample: 'candidate returned only the first operand',
    lessonLine: 'Use both operands.',
    proposalDigest: '0'.repeat(64),
  },
  proof_feedback_package_sha256: 'f'.repeat(64),
});
const fixtureInputs = getFixtureHumanEvalLiftInputs();
const promptByTaskId = new Map(emittedRepairPrompts.prompts.map((prompt) => [prompt.task_id, prompt]));
const packageByTaskId = new Map(emittedFeedbackPackages.packages.map((entry) => [entry.task_id, entry]));
const boundToolAugmentedSamples = fixtureInputs.samples.map((sample) => {
  if (sample.arm !== 'proof') return sample;
  const prompt = promptByTaskId.get(sample.task_id);
  const feedbackRecord = packageByTaskId.get(sample.task_id);
  return {
    ...sample,
    feedback_source: 'atomic-proof-feedback',
    proof_feedback_package: feedbackRecord.proof_feedback_package,
    proof_feedback_package_sha256: feedbackRecord.proof_feedback_package_sha256,
    atomic_receipt_sha256: 'a'.repeat(64),
    repair_prompt_sha256: prompt.repair_prompt_sha256,
  };
});
const verifiedToolAugmentedSamples = verifyToolAugmentedSamples({
  datasetKind: 'fixture-bound-tool-augmented',
  tasks: fixtureInputs.tasks,
  samples: boundToolAugmentedSamples,
  sourceArm: 'baseline',
});
const forgedToolAugmentedSamples = verifyToolAugmentedSamples({
  datasetKind: 'fixture-forged-tool-augmented',
  tasks: fixtureInputs.tasks,
  samples: boundToolAugmentedSamples.map((sample) =>
    sample.arm === 'proof' && sample.task_id === 'HumanEval/fixture_add' ? { ...sample, repair_prompt_sha256: 'e'.repeat(64) } : sample,
  ),
  sourceArm: 'baseline',
});
const unboundToolAugmentedSamples = verifyToolAugmentedSamples();
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
check('claim taxonomy separates raw HumanEval from Atomic tool-augmented HumanEval', report.claimTaxonomy.rawAndToolAugmentedAreDistinct === true && report.claimTaxonomy.rawHumanEvalClaim === false && report.claimTaxonomy.toolAugmentedHumanEvalClaim === false, report.claimTaxonomy);
check('proof-feedback samples carry recomputable proof package digests', report.proofFeedbackPackages.feedbackSampleCount === 3 && report.proofFeedbackPackages.validFeedbackPackageCount === 3 && report.proofFeedbackPackages.allFeedbackPackagesValid === true, report.proofFeedbackPackages);
check('runner emits valid proof-feedback packages from real failing baseline attempts', emittedFeedbackPackages.ok === true && emittedFeedbackPackages.failedSampleCount === 3 && emittedFeedbackPackages.allPackagesValid === true, {
  failedSampleCount: emittedFeedbackPackages.failedSampleCount,
  packagesSha256: emittedFeedbackPackages.packagesSha256,
  validation: emittedFeedbackPackages.validation,
});
check('emitted feedback packages are digest-bound tool guidance, not raw HumanEval evidence', /^[a-f0-9]{64}$/.test(emittedFeedbackPackages.packagesSha256) && emittedFeedbackPackages.proofLimits.some((line) => line.includes('not a raw HumanEval claim')), emittedFeedbackPackages.proofLimits);
check('runner emits digest-bound repair prompts for the fixed model second pass', emittedRepairPrompts.ok === true && emittedRepairPrompts.promptCount === 3 && /^[a-f0-9]{64}$/.test(emittedRepairPrompts.promptsSha256), {
  promptCount: emittedRepairPrompts.promptCount,
  promptsSha256: emittedRepairPrompts.promptsSha256,
});
check('repair prompts are linked one-to-one to proof-feedback package digests', emittedRepairPrompts.prompts.every((prompt) => emittedFeedbackPackages.packages.some((entry) => entry.proof_feedback_package_sha256 === prompt.proof_feedback_package_sha256)), emittedRepairPrompts.prompts.map((prompt) => ({ taskId: prompt.task_id, packageSha256: prompt.proof_feedback_package_sha256, promptSha256: prompt.repair_prompt_sha256 })));
check('repair prompts declare tool-augmented scope and zero hidden model calls', emittedRepairPrompts.proofLimits.some((line) => line.includes('not raw HumanEval evidence')) && emittedRepairPrompts.proofLimits.some((line) => line.includes('zero model calls')), emittedRepairPrompts.proofLimits);
check('forged proof-feedback package digests are rejected before they can support tool-augmented claims', forgedFeedbackPackage.ok === false && forgedFeedbackPackage.reason === 'proof-feedback-package-digest-mismatch', forgedFeedbackPackage);
check('unbound fixture proof samples are refused as tool-augmented samples', unboundToolAugmentedSamples.ok === false && unboundToolAugmentedSamples.validSampleCount === 0, unboundToolAugmentedSamples.checks);
check(
  'tool-augmented samples verify only when receipt, package, and repair prompt digests align',
  verifiedToolAugmentedSamples.ok === true &&
    verifiedToolAugmentedSamples.validSampleCount === 3 &&
    verifiedToolAugmentedSamples.promptManifestSha256 === emittedRepairPrompts.promptsSha256,
  {
    validSampleCount: verifiedToolAugmentedSamples.validSampleCount,
    promptManifestSha256: verifiedToolAugmentedSamples.promptManifestSha256,
    expectedPromptManifestSha256: emittedRepairPrompts.promptsSha256,
  },
);
check(
  'forged repair prompt digests are rejected before they can support tool-augmented claims',
  forgedToolAugmentedSamples.ok === false && forgedToolAugmentedSamples.checks.some((entry) => entry.reason === 'repair-prompt-digest-mismatch'),
  forgedToolAugmentedSamples.checks,
);
check('proof-feedback samples block raw HumanEval claims unless explicit Atomic receipts, feedback packages, and repair prompts support the tool-augmented claim', report.claimTaxonomy.feedbackDerived === true && report.claimTaxonomy.allFeedbackReceiptsBound === false && report.claimTaxonomy.allFeedbackPackagesValid === true && report.claimTaxonomy.allRepairPromptsBound === false && forgedOfficial.claimTaxonomy.rawHumanEvalClaim === false, {
  fixture: report.claimTaxonomy,
  forged: forgedOfficial.claimTaxonomy,
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
check('proof limits require external data and receipt/prompt-bound raw/tool-augmented HumanEval claims', report.proofLimits.some((line) => line.includes('Raw HumanEval claims require an external JSONL dataset')) && report.proofLimits.some((line) => line.includes('emitted prompt manifest')), report.proofLimits);

function compactArm(arm) {
  return {
    total: arm.total,
    passed: arm.passed,
    failed: arm.failed,
    passAt1: arm.passAt1,
    wallRepeatRate: arm.wallRepeatRate,
    costPerPass: arm.costPerPass,
    noveltyIndex: arm.noveltyIndex,
  };
}

const payload = {
  ok: results.every((entry) => entry.ok),
  pass: results.filter((entry) => entry.ok).length,
  fail: results.filter((entry) => !entry.ok).length,
  report: {
    ok: report.ok,
    benchmarkId: report.benchmarkId,
    datasetKind: report.datasetKind,
    formatCompatible: report.formatCompatible,
    taskCount: report.taskCount,
    datasetSha256: report.datasetSha256,
    samplesSha256: report.samplesSha256,
    fullHumanEvalClaim: report.fullHumanEvalClaim,
    officialClaimRefused: report.officialClaimRefused,
    claimTaxonomy: report.claimTaxonomy,
    pythonAvailable: report.pythonAvailable,
    controls: report.controls,
    arms: {
      baseline: compactArm(baseline),
      scalar: compactArm(scalar),
      proof: compactArm(proof),
    },
    deltas: report.deltas,
    proofLimits: report.proofLimits,
  },
  results: results.map((entry) => ({ name: entry.name, ok: entry.ok })),
};
if (jsonMode) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
else for (const entry of results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
process.exit(payload.ok ? 0 : 1);
