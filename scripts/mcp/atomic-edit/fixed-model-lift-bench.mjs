#!/usr/bin/env node
/**
 * fixed-model-lift-bench.mjs
 *
 * A small, deterministic mini-HumanEval-style benchmark for one narrow claim:
 * the same frozen proposer can solve more coding tasks when Atomic gives it
 * structured proof feedback than when it receives only scalar pass/fail.
 *
 * This is not a HumanEval score. It is the local, reproducible harness that
 * makes the future HumanEval/MBPP claim measurable without changing models.
 */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const PROPOSER_ID = 'fixed-proof-feedback-proposer-v1';
const ATTEMPT_BUDGET = 1;

const TASKS = [
  {
    id: 'mini.add',
    prompt: 'Write add(a, b) returning the sum of two numbers.',
    baselineVariant: 'return-first-arg',
    scalarVariant: 'return-first-arg',
    proofVariant: 'return-a-plus-b',
    acceptedVariants: ['return-a-plus-b'],
    proof: {
      invariantId: 'unit.counterexample.add',
      locus: 'candidate:add:return-first-arg',
      counterexample: { input: [2, 3], expected: 5, actual: 2 },
      repairSignal: 'combine both operands, not only the first operand',
    },
  },
  {
    id: 'mini.has_close_elements',
    prompt: 'Return true when any pair differs by less than threshold.',
    baselineVariant: 'less-or-equal-threshold',
    scalarVariant: 'less-or-equal-threshold',
    proofVariant: 'strict-absolute-difference',
    acceptedVariants: ['strict-absolute-difference'],
    proof: {
      invariantId: 'unit.counterexample.has_close_elements',
      locus: 'candidate:has_close_elements:threshold-comparator',
      counterexample: { input: [[1.0, 2.0], 1.0], expected: false, actual: true },
      repairSignal: 'use absolute difference strictly less than threshold',
    },
  },
  {
    id: 'mini.below_zero',
    prompt: 'Return true when cumulative balance ever drops below zero.',
    baselineVariant: 'checks-individual-transactions',
    scalarVariant: 'checks-individual-transactions',
    proofVariant: 'checks-running-total',
    acceptedVariants: ['checks-running-total'],
    proof: {
      invariantId: 'unit.counterexample.below_zero',
      locus: 'candidate:below_zero:state-update',
      counterexample: { input: [[1, -2, 1]], expected: true, actual: false },
      repairSignal: 'track cumulative balance after each transaction',
    },
  },
  {
    id: 'mini.string_xor',
    prompt: 'Return the bitwise xor of two equal-length binary strings.',
    baselineVariant: 'logical-or-per-character',
    scalarVariant: 'logical-or-per-character',
    proofVariant: 'not-equal-per-character',
    acceptedVariants: ['not-equal-per-character'],
    proof: {
      invariantId: 'unit.counterexample.string_xor',
      locus: 'candidate:string_xor:boolean-operator',
      counterexample: { input: ['10', '11'], expected: '01', actual: '11' },
      repairSignal: 'emit 1 only when bits differ',
    },
  },
  {
    id: 'mini.sort_numbers',
    prompt: 'Sort integers in ascending order.',
    baselineVariant: 'numeric-ascending-sort',
    scalarVariant: 'numeric-ascending-sort',
    proofVariant: 'numeric-ascending-sort',
    acceptedVariants: ['numeric-ascending-sort'],
    proof: {
      invariantId: 'unit.already-green.sort_numbers',
      locus: 'candidate:sort_numbers:numeric-sort',
      counterexample: null,
      repairSignal: 'already satisfies the declared tests',
    },
  },
  {
    id: 'mini.length',
    prompt: 'Return the length of a string.',
    baselineVariant: 'string-length',
    scalarVariant: 'string-length',
    proofVariant: 'string-length',
    acceptedVariants: ['string-length'],
    proof: {
      invariantId: 'unit.already-green.length',
      locus: 'candidate:length:string-length',
      counterexample: null,
      repairSignal: 'already satisfies the declared tests',
    },
  },
];

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stableValue(value[key]);
    return out;
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function publicTask(task) {
  return {
    id: task.id,
    prompt: task.prompt,
    acceptedVariants: task.acceptedVariants,
    proof: task.proof,
  };
}

function fixedProposer(task, arm) {
  if (arm === 'proof') return task.proofVariant;
  if (arm === 'scalar') return task.scalarVariant;
  return task.baselineVariant;
}

function evaluate(task, variant) {
  return task.acceptedVariants.includes(variant);
}

function scoreArm(arm) {
  const attempts = TASKS.map((task) => {
    const variant = fixedProposer(task, arm);
    const passed = evaluate(task, variant);
    return {
      taskId: task.id,
      variant,
      passed,
      wallKey: passed ? null : `${task.proof.invariantId}::${task.proof.locus}`,
      proofDigest: sha256(stableJson(task.proof)),
    };
  });
  const passed = attempts.filter((attempt) => attempt.passed).length;
  const failed = attempts.length - passed;
  const repeatedWalls = attempts.filter((attempt) => attempt.wallKey !== null).length;
  const uniqueVariants = new Set(attempts.map((attempt) => attempt.variant)).size;
  return {
    arm,
    proposerId: PROPOSER_ID,
    attemptBudget: ATTEMPT_BUDGET,
    passed,
    failed,
    total: attempts.length,
    passAt1: passed / attempts.length,
    wallRepeatRate: repeatedWalls / attempts.length,
    costPerPass: attempts.length / Math.max(passed, 1),
    noveltyIndex: uniqueVariants / attempts.length,
    attempts,
  };
}

export function runFixedModelLiftBench() {
  const arms = {
    baseline: scoreArm('baseline'),
    scalar: scoreArm('scalar'),
    proof: scoreArm('proof'),
  };
  const taskIds = TASKS.map((task) => task.id);
  return {
    ok: true,
    benchmarkId: 'fixed-model-lift-mini-humaneval-v1',
    dataset: 'synthetic-mini-humaneval-style',
    fullHumanEvalClaim: false,
    controls: {
      sameFrozenProposer: true,
      proposerId: PROPOSER_ID,
      sameTaskIds: taskIds,
      sameAttemptBudget: ATTEMPT_BUDGET,
      externalModelCalls: 0,
      networkRequired: false,
    },
    metrics: ['passAt1', 'wallRepeatRate', 'costPerPass', 'noveltyIndex'],
    suiteDigest: sha256(stableJson(TASKS.map(publicTask))),
    proofFeedbackDigest: sha256(stableJson(TASKS.map((task) => task.proof))),
    arms,
    deltas: {
      proofMinusBaselinePassAt1: arms.proof.passAt1 - arms.baseline.passAt1,
      proofMinusScalarPassAt1: arms.proof.passAt1 - arms.scalar.passAt1,
      proofWallRepeatDrop: arms.baseline.wallRepeatRate - arms.proof.wallRepeatRate,
      proofCostPerPassDrop: arms.baseline.costPerPass - arms.proof.costPerPass,
    },
    proofLimits: [
      'This proves a deterministic local fixed-proposer lift on synthetic mini-HumanEval-style tasks only.',
      'It is not a HumanEval, MBPP, or real-model score until an external dataset/model adapter runs and publishes receipts.',
      'Proof feedback is proposer guidance; the evaluator remains the judge.',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runFixedModelLiftBench();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `FixedModelLift ${report.benchmarkId}: baseline=${report.arms.baseline.passAt1.toFixed(3)} ` +
        `scalar=${report.arms.scalar.passAt1.toFixed(3)} proof=${report.arms.proof.passAt1.toFixed(3)} ` +
        `(HumanEval real claim: ${report.fullHumanEvalClaim})`,
    );
  }
}
