#!/usr/bin/env node
import * as crypto from 'node:crypto';
import * as childProcess from 'node:child_process';

export const BENCHMARK_ID = 'human-eval-lift-protocol-v1';
export const PROOF_FEEDBACK_VERSION = 'atomic-proof-feedback-v1';

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((entry) => canonicalJson(entry)).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
}

export function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function proofFeedbackPackageSha256(pkg) {
  return sha256Text(canonicalJson(pkg));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hex64(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

function asText(value) {
  return typeof value === 'string' ? value : JSON.stringify(value ?? '');
}

export function classifyProofFeedbackPackage(pkg) {
  const errors = [];
  if (!isObject(pkg)) return { ok: false, errors: ['package is not an object'], fullEvaluator: false, minimalDisproof: false };
  if (pkg.version !== PROOF_FEEDBACK_VERSION) errors.push('version mismatch');
  if (pkg.benchmark_id !== BENCHMARK_ID) errors.push('benchmark mismatch');
  if (typeof pkg.task_id !== 'string' || !pkg.task_id) errors.push('task_id missing');
  if (typeof pkg.invariantId !== 'string' || !pkg.invariantId) errors.push('invariantId missing');
  if (!isObject(pkg.locus) || typeof pkg.locus.file !== 'string') errors.push('locus.file missing');
  if (!isObject(pkg.counterexample)) errors.push('counterexample missing');
  if (!hex64(pkg.proposalDigest)) errors.push('proposalDigest must be sha256 hex');
  if (typeof pkg.lessonLine !== 'string' || !pkg.lessonLine) errors.push('lessonLine missing');
  const blob = canonicalJson(pkg);
  const assertCount = (blob.match(/\bassert\b/g) || []).length;
  const fullEvaluatorMarkers = ['FULL_EVALUATOR', 'canonical_solution', 'from human_eval', 'METADATA =', 'def check(candidate):\n    assert'];
  const fullEvaluator = fullEvaluatorMarkers.some((marker) => blob.includes(marker)) || assertCount > 8;
  const minimalDisproof = isObject(pkg.counterexample) && asText(pkg.counterexample.kind || '').length > 0 && !fullEvaluator;
  if (fullEvaluator) errors.push('full evaluator leakage refused');
  return { ok: errors.length === 0, errors, fullEvaluator, minimalDisproof, assertCount };
}

export function validateProofFeedbackPackage(row) {
  const source = row?.feedback_source ?? row?.feedbackSource ?? 'none';
  const pkg = row?.proof_feedback_package ?? row?.proofFeedbackPackage ?? null;
  if (source === 'none' || source === null || source === undefined) {
    return { ok: pkg == null, feedback_source: 'none', reason: pkg == null ? 'pass-through row' : 'pass-through row carries unexpected package' };
  }
  if (source !== 'atomic-proof-feedback') return { ok: false, feedback_source: source, reason: 'unsupported feedback source' };
  if (!isObject(pkg)) return { ok: false, feedback_source: source, reason: 'missing proof_feedback_package' };
  const expected = row.proof_feedback_package_sha256 ?? row.proofFeedbackPackageSha256;
  const actual = proofFeedbackPackageSha256(pkg);
  const classified = classifyProofFeedbackPackage(pkg);
  const taskMatches = typeof row.task_id !== 'string' || row.task_id === pkg.task_id;
  const digestMatches = typeof expected === 'string' && expected === actual;
  return { ok: classified.ok && taskMatches && digestMatches, feedback_source: source, digestMatches, taskMatches, actualSha256: actual, expectedSha256: expected ?? null, classification: classified };
}

export function buildProofFeedbackPackage(input) {
  const pkg = { version: PROOF_FEEDBACK_VERSION, benchmark_id: BENCHMARK_ID, task_id: input.task_id, invariantId: input.invariantId, locus: input.locus ?? { file: input.task_id, startByte: 0, endByte: 0 }, counterexample: input.counterexample, proposalDigest: input.proposalDigest, lessonLine: input.lessonLine, repairHint: input.repairHint ? { trusted: false, text: input.repairHint } : undefined };
  for (const key of Object.keys(pkg)) if (pkg[key] === undefined) delete pkg[key];
  return { proof_feedback_package: pkg, proof_feedback_package_sha256: proofFeedbackPackageSha256(pkg) };
}

export function emitRepairPrompts(input) {
  const failures = Array.isArray(input?.failures) ? input.failures : [];
  const prompts = [];
  const packages = [];
  for (const failure of failures) {
    const built = failure.proof_feedback_package ? { proof_feedback_package: failure.proof_feedback_package, proof_feedback_package_sha256: proofFeedbackPackageSha256(failure.proof_feedback_package) } : buildProofFeedbackPackage({ task_id: failure.task_id, invariantId: failure.invariantId ?? 'humaneval.minimal-counterexample', locus: failure.locus ?? { file: failure.task_id, startByte: 0, endByte: 0 }, counterexample: failure.counterexample ?? { kind: 'minimal-disproof', input: failure.input ?? null, expected: failure.expected ?? null, observed: failure.observed ?? null }, proposalDigest: failure.proposalDigest ?? sha256Text(String(failure.task_id) + ':' + String(failure.observed ?? '')), lessonLine: failure.lessonLine ?? 'Repair the candidate against the minimal counterexample without using hidden tests.', repairHint: failure.repairHint });
    const row = { task_id: failure.task_id, feedback_source: 'atomic-proof-feedback', ...built };
    const validation = validateProofFeedbackPackage(row);
    if (!validation.ok) return { ok: false, error: 'invalid proof feedback package for ' + failure.task_id, validation };
    const prompt = [String(failure.prompt ?? ''), '', 'ATOMIC PROOF FEEDBACK PACKAGE ' + built.proof_feedback_package_sha256, built.proof_feedback_package.lessonLine, 'Minimal counterexample: ' + JSON.stringify(built.proof_feedback_package.counterexample), 'Return only corrected Python code. Do not quote hidden tests or evaluator code.'].join('\n');
    prompts.push({ task_id: failure.task_id, repair_prompt: prompt, repair_prompt_sha256: sha256Text(prompt) });
    packages.push(row);
  }
  return { ok: true, prompts, packages, packageCount: packages.length };
}

function runPython(pythonBin, source, timeoutMs) {
  const res = childProcess.spawnSync(pythonBin, ['-I', '-B', '-c', source], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1024 * 1024 });
  return { status: res.status, signal: res.signal, stdout: res.stdout ?? '', stderr: res.stderr ?? '', error: res.error ? String(res.error.message || res.error) : null };
}

export function evaluateSamples(input) {
  const pythonBin = input?.pythonBin || process.env.PYTHON || 'python3';
  const timeoutMs = Number(input?.timeoutMs ?? 3000);
  const tasks = new Map((input?.tasks ?? []).map((task) => [task.task_id, task]));
  const samples = Array.isArray(input?.samples) ? input.samples : [];
  const results = [];
  for (const sample of samples) {
    const task = tasks.get(sample.task_id);
    if (!task) return { ok: false, error: 'missing task ' + sample.task_id };
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(task.entry_point ?? ''))) return { ok: false, error: 'unsafe entry_point ' + String(task.entry_point) };
    const program = String(task.prompt ?? '') + '\n' + String(sample.completion ?? '') + '\n' + String(task.test ?? '') + '\ncheck(' + String(task.entry_point) + ')\n';
    const res = runPython(pythonBin, program, timeoutMs);
    results.push({ task_id: sample.task_id, arm: sample.arm ?? 'unknown', passed: res.status === 0, status: res.status, stderr: res.stderr.slice(0, 1000) });
  }
  const passed = results.filter((row) => row.passed).length;
  return { ok: true, passed, total: results.length, results };
}

export function evaluateMinimalDisproofClaim(row) {
  const validation = validateProofFeedbackPackage(row);
  return { ok: validation.ok === true, packageValid: validation.ok === true, fullEvaluatorLeakage: validation.classification?.fullEvaluator === true, minimalDisproof: validation.classification?.minimalDisproof === true, validation };
}

export function evaluateLiftClaim(input) {
  const baseline = input.baseline ?? {};
  const proof = input.proof ?? {};
  const cego = input.cego ?? input.blind ?? {};
  const scalar = input.scalar ?? {};
  const sameFixedModel = Boolean(baseline.model_id && proof.model_id && baseline.model_id === proof.model_id && (!cego.model_id || cego.model_id === baseline.model_id) && (!scalar.model_id || scalar.model_id === baseline.model_id));
  const feedbackDerived = Boolean(input.feedbackDerived ?? proof.feedbackDerived ?? proof.feedback_source === 'atomic-proof-feedback');
  const total = Number(proof.total ?? baseline.total ?? 0);
  const liftCount = Number(proof.passed ?? 0) - Number(baseline.passed ?? 0);
  const rawHumanEvalClaim = Boolean(!feedbackDerived && sameFixedModel && Number(baseline.total ?? 0) > 0);
  const toolAugmentedHumanEvalClaim = Boolean(feedbackDerived && sameFixedModel && total > 0);
  const packageValid = input.packageValid !== false && proof.packageValid !== false;
  const repairBound = input.repairBound !== false && proof.repairBound !== false;
  const verdict = sameFixedModel && packageValid && repairBound && liftCount > 0 ? 'established' : 'not-established';
  return { ok: true, sameFixedModel, feedbackDerived, rawHumanEvalClaim, toolAugmentedHumanEvalClaim, rawAndToolAugmentedAreDistinct: rawHumanEvalClaim !== toolAugmentedHumanEvalClaim, baseline, cego, scalar, proof, liftCount, fixedModelLiftClaim: { verdict, liftCount, sameFixedModel, packageValid, repairBound } };
}

export function analyzeReplicas(input) {
  const replicas = Array.isArray(input?.replicas) ? input.replicas : [];
  const alpha = Number(input?.alpha ?? 0.05);
  const mean = (key) => replicas.reduce((sum, row) => sum + Number(row[key] ?? 0), 0) / Math.max(1, replicas.length);
  const proofWinsBlindReplicas = replicas.filter((row) => Number(row.proof ?? 0) > Number((row.blind ?? row.cego) ?? 0)).length;
  const pValue = Number(input?.pValue ?? input?.p_value ?? NaN);
  const verdict = Number.isFinite(pValue) && pValue < alpha ? 'established' : 'directional';
  return { ok: replicas.length > 0, n: replicas.length, alpha, means: { blind: mean('blind') || mean('cego'), cego: mean('cego') || mean('blind'), scalar: mean('scalar'), proof: mean('proof') }, proofWinsBlindReplicas, pValue: Number.isFinite(pValue) ? pValue : null, verdict };
}

export function fixture(kind) {
  if (kind === 'v1-report') return { baseline: { model_id: 'claude-3-5-haiku-fixed', passed: 140, total: 164 }, cego: { model_id: 'claude-3-5-haiku-fixed', passed: 151, total: 164 }, scalar: { model_id: 'claude-3-5-haiku-fixed', passed: 152, total: 164 }, proof: { model_id: 'claude-3-5-haiku-fixed', passed: 154, total: 164, feedbackDerived: true, packageValid: true, repairBound: true }, feedbackDerived: true, packageValid: true, repairBound: true };
  if (kind === 'v1-replicas') return { alpha: 0.05, pValue: 0.05572, replicas: [{ seed: 'r1', cego: 11, blind: 11, scalar: 12, proof: 14 }, { seed: 'r2', cego: 16, blind: 16, scalar: 16, proof: 18 }, { seed: 'r3', cego: 11, blind: 11, scalar: 16, proof: 15 }, { seed: 'r4', cego: 15, blind: 15, scalar: 11, proof: 17 }, { seed: 'r5', cego: 13, blind: 13, scalar: 11, proof: 15 }] };
  if (kind === 'toy-eval') return { tasks: [{ task_id: 'HumanEval/0', prompt: 'def add(a, b):\n', entry_point: 'add', test: 'def check(fn):\n    assert fn(2, 3) == 5\n    assert fn(-1, 1) == 0\n' }], samples: [{ task_id: 'HumanEval/0', arm: 'proof', completion: '    return a + b\n' }] };
  throw new Error('unknown fixture ' + kind);
}

export function selfTest() {
  const built = buildProofFeedbackPackage({ task_id: 'HumanEval/0', invariantId: 'humaneval.minimal-counterexample', locus: { file: 'HumanEval/0', startByte: 0, endByte: 10 }, counterexample: { kind: 'minimal-disproof', input: [2, 3], expected: 5, observed: 6 }, proposalDigest: sha256Text('bad add'), lessonLine: 'Addition must return the arithmetic sum for the provided counterexample.' });
  const checks = [];
  const rec = (name, ok, detail = {}) => checks.push({ name, ok: Boolean(ok), detail });
  rec('package validates', validateProofFeedbackPackage({ task_id: 'HumanEval/0', feedback_source: 'atomic-proof-feedback', ...built }).ok);
  rec('forged digest refused', !validateProofFeedbackPackage({ task_id: 'HumanEval/0', feedback_source: 'atomic-proof-feedback', ...built, proof_feedback_package_sha256: sha256Text('forged') }).ok);
  rec('pass-through accepted', validateProofFeedbackPackage({ task_id: 'HumanEval/1', feedback_source: 'none' }).ok);
  rec('v1 lift established', evaluateLiftClaim(fixture('v1-report')).fixedModelLiftClaim.verdict === 'established');
  rec('v1 replicas directional', analyzeReplicas(fixture('v1-replicas')).verdict === 'directional');
  rec('toy eval passes', evaluateSamples(fixture('toy-eval')).passed === 1);
  rec('repair prompt emits package', emitRepairPrompts({ failures: [{ task_id: 'HumanEval/0', prompt: 'def add(a,b):\n', observed: 6, expected: 5 }] }).ok);
  return { ok: checks.every((entry) => entry.ok), checks };
}

export function runCli(argv, stdinText = '') {
  const json = argv.includes('--json');
  let payload;
  if (argv.includes('--self-test')) payload = selfTest();
  else if (argv.includes('--validate-package')) payload = validateProofFeedbackPackage(JSON.parse(stdinText || '{}'));
  else if (argv.includes('--emit-repair-prompts')) payload = emitRepairPrompts(JSON.parse(stdinText || '{}'));
  else if (argv.includes('--evaluate-samples')) payload = evaluateSamples(JSON.parse(stdinText || '{}'));
  else if (argv.includes('--claim-official-humaneval')) payload = evaluateLiftClaim(JSON.parse(stdinText || '{}'));
  else if (argv.includes('--analyze-replicas')) payload = analyzeReplicas(JSON.parse(stdinText || '{}'));
  else payload = { ok: false, error: 'unknown mode' };
  process.stdout.write((json ? JSON.stringify(payload, null, 2) : JSON.stringify(payload)) + '\n');
  return payload.ok === false ? 1 : 0;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  let stdin = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { stdin += chunk; });
  process.stdin.on('end', () => { process.exit(runCli(process.argv.slice(2), stdin)); });
}
