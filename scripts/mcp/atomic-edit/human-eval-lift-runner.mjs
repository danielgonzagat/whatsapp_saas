#!/usr/bin/env node
/**
 * human-eval-lift-runner.mjs
 *
 * HumanEval-format lift protocol for one honest claim: given the same fixed
 * model outputs under different feedback arms, measure whether structured
 * proof feedback increases Pass@1. The bundled fixture is deliberately tiny
 * and HumanEval-shaped; it is not the official HumanEval score.
 */
import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const FIXTURE_TASKS = [
  {
    task_id: 'HumanEval/fixture_add',
    entry_point: 'add',
    prompt: 'def add(a, b):\n    ',
    test: 'def check(candidate):\n    assert candidate(2, 3) == 5\n    assert candidate(-1, 4) == 3\n',
  },
  {
    task_id: 'HumanEval/fixture_below_zero',
    entry_point: 'below_zero',
    prompt: 'def below_zero(operations):\n    ',
    test:
      'def check(candidate):\n' +
      '    assert candidate([1, -2, 1]) is True\n' +
      '    assert candidate([1, 2, -2]) is False\n' +
      '    assert candidate([-1]) is True\n',
  },
  {
    task_id: 'HumanEval/fixture_has_close_elements',
    entry_point: 'has_close_elements',
    prompt: 'def has_close_elements(numbers, threshold):\n    ',
    test:
      'def check(candidate):\n' +
      '    assert candidate([1, 2], 2) is True\n' +
      '    assert candidate([1, 3], 2) is False\n' +
      '    assert candidate([1, 4, 5], 2) is True\n',
  },
];

function fixtureFeedbackFields(taskId, invariantId, counterexample, lessonLine, rejectedCompletion) {
  const proofFeedbackPackage = {
    version: 'atomic-proof-feedback-v1',
    task_id: taskId,
    invariantId,
    counterexample,
    lessonLine,
    proposalDigest: sha256(`${taskId}\n${rejectedCompletion}`),
  };
  return {
    feedback_source: 'atomic-proof-feedback',
    proof_feedback_package: proofFeedbackPackage,
    proof_feedback_package_sha256: sha256(canonical(proofFeedbackPackage)),
  };
}

const FIXTURE_SAMPLES = [
  { task_id: 'HumanEval/fixture_add', arm: 'baseline', model_id: 'fixed-model-fixture-v1', attempt_budget: 1, completion: 'return a\n' },
  { task_id: 'HumanEval/fixture_add', arm: 'scalar', model_id: 'fixed-model-fixture-v1', attempt_budget: 1, completion: 'return a\n' },
  {
    task_id: 'HumanEval/fixture_add',
    arm: 'proof',
    model_id: 'fixed-model-fixture-v1',
    attempt_budget: 1,
    completion: 'return a + b\n',
    ...fixtureFeedbackFields(
      'HumanEval/fixture_add',
      'unit.counterexample.add',
      'candidate returned only the first operand; check requires add(2, 3) == 5',
      'Use both operands when the tests prove the function is binary addition.',
      'return a\n',
    ),
  },
  {
    task_id: 'HumanEval/fixture_below_zero',
    arm: 'baseline',
    model_id: 'fixed-model-fixture-v1',
    attempt_budget: 1,
    completion: 'return any(op < 0 for op in operations)\n',
  },
  {
    task_id: 'HumanEval/fixture_below_zero',
    arm: 'scalar',
    model_id: 'fixed-model-fixture-v1',
    attempt_budget: 1,
    completion: 'return any(op < 0 for op in operations)\n',
  },
  {
    task_id: 'HumanEval/fixture_below_zero',
    arm: 'proof',
    model_id: 'fixed-model-fixture-v1',
    attempt_budget: 1,
    completion:
      'balance = 0\n' +
      '    for op in operations:\n' +
      '        balance += op\n' +
      '        if balance < 0:\n' +
      '            return True\n' +
      '    return False\n',
    ...fixtureFeedbackFields(
      'HumanEval/fixture_below_zero',
      'unit.counterexample.below_zero',
      'candidate checked individual operations instead of the running balance; [1, 2, -2] must stay nonnegative',
      'Track the cumulative balance and fail only when the prefix sum drops below zero.',
      'return any(op < 0 for op in operations)\n',
    ),
  },
  {
    task_id: 'HumanEval/fixture_has_close_elements',
    arm: 'baseline',
    model_id: 'fixed-model-fixture-v1',
    attempt_budget: 1,
    completion:
      'return any(abs(a - b) <= threshold for i, a in enumerate(numbers) for b in numbers[i + 1:])\n',
  },
  {
    task_id: 'HumanEval/fixture_has_close_elements',
    arm: 'scalar',
    model_id: 'fixed-model-fixture-v1',
    attempt_budget: 1,
    completion:
      'return any(abs(a - b) <= threshold for i, a in enumerate(numbers) for b in numbers[i + 1:])\n',
  },
  {
    task_id: 'HumanEval/fixture_has_close_elements',
    arm: 'proof',
    model_id: 'fixed-model-fixture-v1',
    attempt_budget: 1,
    completion:
      'return any(abs(a - b) < threshold for i, a in enumerate(numbers) for b in numbers[i + 1:])\n',
    ...fixtureFeedbackFields(
      'HumanEval/fixture_has_close_elements',
      'unit.counterexample.has_close_elements',
      'candidate used <= threshold; check requires has_close_elements([1, 3], 2) is False',
      'Use strict distance when the counterexample proves equality at the threshold must be rejected.',
      'return any(abs(a - b) <= threshold for i, a in enumerate(numbers) for b in numbers[i + 1:])\n',
    ),
  },
];

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseJsonl(text, label) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${label}:${index + 1}: invalid JSONL: ${error.message}`);
      }
    });
}

function readJsonlFile(file, label) {
  return parseJsonl(fs.readFileSync(path.resolve(file), 'utf8'), label);
}

function assertHumanEvalShape(task) {
  return (
    task &&
    typeof task.task_id === 'string' &&
    typeof task.prompt === 'string' &&
    typeof task.test === 'string' &&
    typeof task.entry_point === 'string'
  );
}

function sampleKey(sample) {
  return `${sample.arm ?? 'proof'}\u0000${sample.task_id}`;
}

function feedbackSource(sample) {
  if (typeof sample.feedback_source === 'string' && sample.feedback_source.trim()) return sample.feedback_source.trim();
  return sample.arm === 'proof' ? 'atomic-proof-feedback' : 'none';
}

function isExplicitReceiptSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function proofFeedbackPackageDigest(feedbackPackage) {
  return sha256(canonical(feedbackPackage));
}

export function validateProofFeedbackPackage(sample) {
  if (feedbackSource(sample) === 'none') return { ok: true, reason: 'no-feedback' };
  const feedbackPackage = sample.proof_feedback_package;
  if (!feedbackPackage || typeof feedbackPackage !== 'object' || Array.isArray(feedbackPackage)) {
    return { ok: false, reason: 'missing-proof-feedback-package' };
  }
  if (feedbackPackage.version !== 'atomic-proof-feedback-v1') return { ok: false, reason: 'unsupported-proof-feedback-package-version' };
  if (feedbackPackage.task_id !== sample.task_id) return { ok: false, reason: 'task-id-mismatch' };
  if (typeof feedbackPackage.invariantId !== 'string' || !feedbackPackage.invariantId) return { ok: false, reason: 'missing-invariant-id' };
  if (typeof feedbackPackage.counterexample !== 'string' || !feedbackPackage.counterexample) return { ok: false, reason: 'missing-counterexample' };
  if (typeof feedbackPackage.lessonLine !== 'string' || !feedbackPackage.lessonLine) return { ok: false, reason: 'missing-lesson-line' };
  if (!isExplicitReceiptSha(feedbackPackage.proposalDigest)) return { ok: false, reason: 'missing-proposal-digest' };
  const expectedDigest = proofFeedbackPackageDigest(feedbackPackage);
  if (sample.proof_feedback_package_sha256 !== expectedDigest) {
    return { ok: false, reason: 'proof-feedback-package-digest-mismatch', expectedDigest, actualDigest: sample.proof_feedback_package_sha256 ?? null };
  }
  return { ok: true, reason: 'valid-proof-feedback-package', digest: expectedDigest };
}

function pythonSource(task, sample) {
  return `${task.prompt}${sample.completion}\n${task.test}\ncheck(${task.entry_point})\n`;
}

function runPython(task, sample, timeoutMs) {
  const source = pythonSource(task, sample);
  const child = childProcess.spawnSync('python3', ['-I', '-B', '-c', 'import sys; exec(sys.stdin.read(), {})'], {
    input: source,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  });
  const stderr = child.stderr || '';
  const stdout = child.stdout || '';
  const passed = child.status === 0 && child.error === undefined;
  return {
    taskId: task.task_id,
    arm: sample.arm ?? 'proof',
    passed,
    status: child.status,
    timedOut: child.error?.code === 'ETIMEDOUT',
    stdoutSha256: sha256(stdout),
    stderrSha256: sha256(stderr),
    failureKind: passed ? null : child.error?.code ?? (stderr.includes('AssertionError') ? 'assertion' : 'runtime'),
  };
}

function summarizeArm(arm, tasks, samplesByKey, timeoutMs) {
  const attempts = tasks.map((task) => {
    const sample = samplesByKey.get(`${arm}\u0000${task.task_id}`);
    if (!sample) {
      return { taskId: task.task_id, arm, passed: false, failureKind: 'missing-sample' };
    }
    return runPython(task, sample, timeoutMs);
  });
  const passed = attempts.filter((attempt) => attempt.passed).length;
  const failed = attempts.length - passed;
  return {
    arm,
    total: attempts.length,
    passed,
    failed,
    passAt1: attempts.length === 0 ? 0 : passed / attempts.length,
    wallRepeatRate: attempts.length === 0 ? 0 : failed / attempts.length,
    costPerPass: passed === 0 ? null : attempts.length / passed,
    noveltyIndex: 1,
    attempts,
  };
}

function loadInputs(options) {
  if (options.datasetFile || options.samplesFile) {
    if (!options.datasetFile || !options.samplesFile) throw new Error('external HumanEval lift requires both datasetFile and samplesFile');
    return {
      datasetKind: 'external-jsonl',
      tasks: readJsonlFile(options.datasetFile, 'dataset'),
      samples: readJsonlFile(options.samplesFile, 'samples'),
      datasetDigestSource: fs.readFileSync(path.resolve(options.datasetFile), 'utf8'),
      samplesDigestSource: fs.readFileSync(path.resolve(options.samplesFile), 'utf8'),
    };
  }
  return {
    datasetKind: 'fixture-humaneval-format',
    tasks: FIXTURE_TASKS,
    samples: FIXTURE_SAMPLES,
    datasetDigestSource: canonical(FIXTURE_TASKS),
    samplesDigestSource: canonical(FIXTURE_SAMPLES),
  };
}

export function runHumanEvalLiftBench(options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 2000;
  const input = loadInputs(options);
  const tasks = input.tasks;
  const samples = input.samples;
  const shapeErrors = tasks.filter((task) => !assertHumanEvalShape(task)).map((task) => task?.task_id ?? '<missing-task-id>');
  const samplesByKey = new Map(samples.map((sample) => [sampleKey(sample), sample]));
  const arms = ['baseline', 'scalar', 'proof'];
  const modelIds = [...new Set(samples.map((sample) => sample.model_id ?? '<missing-model-id>'))].sort();
  const attemptBudgets = [...new Set(samples.map((sample) => Number(sample.attempt_budget ?? 1)))].sort((a, b) => a - b);
  const armReports = Object.fromEntries(arms.map((arm) => [arm, summarizeArm(arm, tasks, samplesByKey, timeoutMs)]));
  const external = input.datasetKind === 'external-jsonl';
  const requestedOfficialClaim = Boolean(options.claimOfficialHumanEval);
  const officialShape = external && tasks.length >= 164 && tasks.every((task) => String(task.task_id).startsWith('HumanEval/'));
  const feedbackSamples = samples.filter((sample) => feedbackSource(sample) !== 'none');
  const feedbackPackageChecks = feedbackSamples.map((sample) => ({ taskId: sample.task_id, arm: sample.arm ?? 'proof', ...validateProofFeedbackPackage(sample) }));
  const feedbackDerived = feedbackSamples.length > 0;
  const allFeedbackReceiptsBound = feedbackSamples.length > 0 && feedbackSamples.every((sample) => isExplicitReceiptSha(sample.atomic_receipt_sha256));
  const allFeedbackPackagesValid = feedbackSamples.length > 0 && feedbackPackageChecks.every((entry) => entry.ok);
  const rawHumanEvalClaim = requestedOfficialClaim && officialShape && !feedbackDerived;
  const toolAugmentedHumanEvalClaim = requestedOfficialClaim && officialShape && feedbackDerived && allFeedbackReceiptsBound && allFeedbackPackagesValid;
  const fullHumanEvalClaim = rawHumanEvalClaim;
  const pythonProbe = childProcess.spawnSync('python3', ['--version'], { encoding: 'utf8', timeout: 1000 });
  return {
    ok: shapeErrors.length === 0,
    benchmarkId: 'human-eval-lift-protocol-v1',
    datasetKind: input.datasetKind,
    formatCompatible: shapeErrors.length === 0,
    taskCount: tasks.length,
    datasetSha256: sha256(input.datasetDigestSource),
    samplesSha256: sha256(input.samplesDigestSource),
    fullHumanEvalClaim,
    officialClaimRefused: requestedOfficialClaim && !rawHumanEvalClaim && !toolAugmentedHumanEvalClaim,
    claimTaxonomy: {
      officialShape,
      feedbackDerived,
      feedbackSampleCount: feedbackSamples.length,
      allFeedbackReceiptsBound,
      allFeedbackPackagesValid,
      rawHumanEvalClaim,
      toolAugmentedHumanEvalClaim,
      rawAndToolAugmentedAreDistinct: true,
    },
    pythonAvailable: pythonProbe.status === 0,
    proofFeedbackPackages: {
      feedbackSampleCount: feedbackSamples.length,
      validFeedbackPackageCount: feedbackPackageChecks.filter((entry) => entry.ok).length,
      allFeedbackPackagesValid,
      checks: feedbackPackageChecks,
    },
    controls: {
      sameFixedModel: modelIds.length === 1,
      modelIds,
      sameAttemptBudget: attemptBudgets.length === 1,
      attemptBudgets,
      externalModelCalls: 0,
      networkRequired: false,
    },
    arms: armReports,
    deltas: {
      proofMinusBaselinePassAt1: armReports.proof.passAt1 - armReports.baseline.passAt1,
      proofMinusScalarPassAt1: armReports.proof.passAt1 - armReports.scalar.passAt1,
      proofWallRepeatDrop: armReports.baseline.wallRepeatRate - armReports.proof.wallRepeatRate,
    },
    proofLimits: [
      'Bundled fixture proves only a HumanEval-format runner and fixed-model lift protocol, not the official HumanEval score.',
      'Raw HumanEval claims require an external JSONL dataset, external fixed-model samples, >=164 HumanEval/* tasks, and no proof-feedback-derived samples.',
      'Atomic tool-augmented HumanEval claims require the same external shape plus explicit Atomic receipt sha256 values and recomputable proof-feedback package digests for feedback-derived samples.',
      'The runner evaluates submitted samples; it does not call or improve a model by itself.',
    ],
  };
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--dataset') options.datasetFile = argv[++i];
    else if (arg === '--samples') options.samplesFile = argv[++i];
    else if (arg === '--claim-official-humaneval') options.claimOfficialHumanEval = true;
    else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++i]);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = runHumanEvalLiftBench(options);
    if (options.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    else {
      process.stdout.write(
        `HumanEvalLiftProtocol ${report.datasetKind}: baseline=${report.arms.baseline.passAt1.toFixed(3)} ` +
          `scalar=${report.arms.scalar.passAt1.toFixed(3)} proof=${report.arms.proof.passAt1.toFixed(3)} ` +
          `(rawOfficial=${report.claimTaxonomy.rawHumanEvalClaim} toolOfficial=${report.claimTaxonomy.toolAugmentedHumanEvalClaim})\n`,
      );
    }
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    const payload = { ok: false, error: error.message };
    if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    else process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
